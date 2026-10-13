/**
 * reFuzz campaign control protocol for one role session.
 *
 * Control tools (the coordinator's wait and conclude calls) change the decision
 * state and end the worker's turn, so:
 * 1. a step that calls a control tool together with any other tool is refused:
 *    every call in that step is denied with `exclusiveReason`;
 * 2. a successful control call concludes the turn at its step;
 * 3. a turn about to end without a successful control call is steered once with
 *    `nudge`; a second such ending closes the turn, which the caller records as
 *    incomplete.
 *
 * All three decisions read the session log, so they hold across resumed
 * sessions and need no plugin state.
 */
import { randomUUID } from 'node:crypto'

export const name = 'refuzz-control'
export const inject = ['agents', 'tools']

const SOURCE_KIND = 'refuzz-control'

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {{ controlTools: string[], exclusiveReason: string, nudge: string }} config
 */
export function apply(ctx, config) {
  if (!Array.isArray(config?.controlTools) || config.controlTools.length === 0
    || typeof config.exclusiveReason !== 'string' || typeof config.nudge !== 'string') {
    throw new Error('refuzz-control: config needs controlTools, exclusiveReason and nudge')
  }
  const control = new Set(config.controlTools)

  ctx.on('tools/pre-execute', async (exec, next) => {
    const names = stepCallNames(exec.agent?.session)
    if (names.length > 1 && names.some(name => control.has(name))) {
      return { kind: 'deny', reason: config.exclusiveReason }
    }
    return next()
  })

  // Marking before dispatch is safe: only a successful result carries the marker.
  ctx.on('tools/execute', async (exec, next) => {
    if (control.has(exec.name)) exec.concludeTurn()
    return next()
  })

  ctx.on('agent/turn-stopping', ({ agent, turn }) => {
    const events = turnEvents(agent.session, turn)
    if (controlSucceeded(events, control)) return
    if (events.some(event => event.type === 'user/message' && event.data.source?.kind === SOURCE_KIND)) return
    agent.steer(Object.freeze({
      id: randomUUID(),
      role: 'user',
      content: [{ type: 'text', text: config.nudge }],
      source: { kind: SOURCE_KIND },
    }))
  })
}

/** Tool names called by the session's latest assistant message. */
function stepCallNames(session) {
  if (session === undefined) return []
  const events = session.ownEvents()
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].type === 'assistant/message') {
      return events[i].data.message.content.filter(block => block.type === 'tool-call').map(block => block.name)
    }
  }
  return []
}

/** Events of `turn`, from its `turn/start` to the end of the log. */
function turnEvents(session, turn) {
  const events = session.ownEvents()
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].type === 'turn/start' && events[i].data.turn === turn) return events.slice(i)
  }
  return []
}

function controlSucceeded(events, control) {
  const calls = new Set(events
    .filter(event => event.type === 'tool/call' && control.has(event.data.name))
    .map(event => event.data.callId))
  return events.some(event => event.type === 'tool/result'
    && calls.has(event.data.message.toolCallId) && event.data.message.isError !== true)
}
