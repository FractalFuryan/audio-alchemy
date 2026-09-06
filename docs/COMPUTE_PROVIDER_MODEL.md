# Compute provider model (docs only)

How Audio Alchemy should think about **where** audio is generated. Local-only today; hosted paths are deferred.

## Providers

| Provider | Meaning | Public product? |
| --- | --- | --- |
| **Local** | Owner configured ACE-Step (or mock) on the machine the app is configured for | Single-user only |
| **Hosted** | Platform-operated GPU workers behind auth, quotas, and a job queue | Only after hosting boundary work |
| **User endpoint** | User-supplied remote ACE-compatible URL (e.g. optional XL eval) with explicit config | Never silently; never labeled local |

## Non-negotiables

1. **Never route public or multi-user work to a local development GPU.** Local hardware serves local sessions only.
2. **Requested is not actual** unless the worker inventory / job result confirms the checkpoint and provider. UI and metadata must not label a requested model as the one that already ran.
3. **Honest capabilities.** If SFT / planner / remote XL is not confirmed in inventory, do not claim it is available. Prefer neutral "Checking local engine…" over a wrong result.
4. **Quality / SFT** remains the preferred default when local SFT is confirmed. **Song focus** enables only when the local planner / LM is confirmed — no silent Direct fallback while Song focus stays selected.
5. **Mock** is an explicit GENERATION_MODE=mock demo path — never presented as ACE-Step online.

## Local mode (current product)

- Generations run on the owner configured local engine.
- Diagnostics and Ownership state this clearly; the Create surface uses a small status pill, not a developer inventory dump.
- Optional remote XL remains an advanced eval path (docs/REMOTE_XL_EVAL.md) with truthful capability flags.

## When hosted compute exists (future)

- Platform workers are a separate pool with quotas and audit.
- User endpoints are opt-in per account and never reuse a local development worker.
- Failures degrade with clear provider labels (hosted vs user endpoint vs local), not silent cross-routing.

This file does not implement hosting. See HOSTING_BOUNDARY.md.
