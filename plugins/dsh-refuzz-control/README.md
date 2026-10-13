# refuzz-control

reFuzz campaign control protocol, loaded by absolute path from a role patch (`campaign_runtime/harness/profile.py`). Not part of any shipped profile; plain ESM, no build step.

Config: `controlTools` (model-visible names of the coordinator's wait and conclude tools), `exclusiveReason`, `nudge`.

| Point | Rule |
|---|---|
| `tools/pre-execute` | the latest assistant message calls a control tool and any other tool: every call of that step is denied with `exclusiveReason` |
| `tools/execute` | a control call marks its execution `concludeTurn`; only a successful result carries the marker, so the turn ends at that step |
| `agent/turn-stopping` | the turn has no successful control result and no earlier nudge: steer once with `nudge`; otherwise let it close (the caller records an incomplete turn) |

All rules read the session log; the plugin keeps no state, so a resumed session behaves the same.
Acceptance: `campaign_runtime/harness/probes/run_h2.py` in reFuzz AutoCVE.
