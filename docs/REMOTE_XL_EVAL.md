# Remote XL evaluation path (optional)

**Status: evaluation-only.** XL is not a production tier and must not be marketed or enabled as one until it wins the documented listening gate in `QUALITY_GATES.md` against the verified local SFT baseline.

## Purpose

App-side support for evaluating ACE-Step **XL** checkpoints on a **20–24GB** (or larger) GPU via a **configured endpoint URL**. This is an optional, pull/client-outbound path. It does not create cloud accounts, billing, queues, or GPU infrastructure, and it never turns local development hardware into public shared compute.

## Local default (unchanged)

On a local **10GB-class consumer GPU**:

| Preset | Capability | Typical checkpoint |
| --- | --- | --- |
| Fast | `local-2b-turbo` | `acestep-v15-turbo` |
| Quality | `local-2b-sft` | `acestep-v15-sft` |

`QUALITY_TIER` defaults to `local-sft`. XL is **not** offered in the Create UI merely because a string appears in a dropdown — XL only surfaces when a **remote** provider health/inventory confirms it.

## Optional remote endpoint

Set a base URL the Next.js server can call outbound:

```bash
QUALITY_TIER=remote-xl-sft
ACESTEP_REMOTE_URL=http://127.0.0.1:8002
# or ACESTEP_XL_API_URL=...
# optional: ACESTEP_REMOTE_API_KEY=...  (server-only)
```

Local `ACESTEP_API_URL` remains the 2B worker. Remote is a separate configured endpoint (BYO GPU box, lab machine, or any approved hosted ACE-compatible API). No vendor is prescribed here.

## Capability ids

Health / models APIs expose:

| Id | Meaning |
| --- | --- |
| `local-2b-sft` | Local 2B SFT-class |
| `local-2b-turbo` | Local 2B Turbo-class |
| `remote-xl-sft` | Remote XL SFT-class (inventory-confirmed) |
| `remote-xl-turbo` | Remote XL Turbo-class (inventory-confirmed) |

Each capability reports **configured** (env/tier) vs **available** (reachable + inventory confirms the class).

## Failure mode (truthful)

If `QUALITY_TIER=remote-xl-sft` but remote health does **not** confirm XL-SFT loaded/available, the Quality/XL path returns a **clear error**. The app must **not** silently run local SFT and label the result as XL.

## Future eval on 20–24GB

1. Run an ACE-Step API on a 20–24GB GPU with an XL checkpoint loaded.
2. Point `ACESTEP_REMOTE_URL` at that API (LAN or SSH tunnel — your choice).
3. Set `QUALITY_TIER=remote-xl-sft`.
4. Confirm `/api/health` → `capabilities` shows `remote-xl-sft.available: true`.
5. Generate with Quality; library/create status shows **actual** capability/family from confirmed result fields (`actualModelName` / `actualCapability`), not the requested id alone.

## Non-goals

- No cloud resource creation, auth products, billing, or multi-tenant queues in this path.
- No sharing local development hardware as a public remote worker.
- No change to the local 2B SFT + Turbo default when `QUALITY_TIER=local-sft`.

See also `.env.example`, `QUALITY.md`, `QUALITY_PLAN.md`.
