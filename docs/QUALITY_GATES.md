# Quality gates before hosted beta

Eval gates that should pass before any hosted multi-user beta. Complements QUALITY.md, QUALITY_PLAN.md, and RUBRIC.md. Docs only — no hosted pipeline here.

## Purpose

Local listening and harness results decide whether platform-hosted compute is worth opening. Do not ship a hosted beta on marketing claims alone.

## Blinded listening

- Use fixed prompt packs (scripts/eval/prompts.json) and blind A/B where possible (scripts/eval/blind_ab_template.csv).
- Prefer paired comparisons (Quality vs Fast, SFT vs Turbo, Song focus vs Direct) with scorers unaware of condition labels.
- Ship-style preference threshold (from RUBRIC.md): at least 55% preference excluding ties for the candidate default over the control.

## Dimensions to score

| Dimension | What to check |
| --- | --- |
| Adherence | Output matches prompt / brief intent |
| Coherence | Structure, arrangement continuity, fewer collapses |
| Vocals | Intelligibility / stability when lyrics requested; sensible instrumental when [inst] |
| Artifacts | Clicks, warble, extreme harshness, broken endings |
| Latency | Wall time acceptable for the tier (Fast vs Quality; Song focus slower by design) |
| Failure | Timeout, OOM, missing audio, false completed without playable file |

## Defaults and honesty

- SFT / Quality stays the UI default only if it keeps winning on adherence/coherence in blinded sets against Fast/Turbo on the same local class.
- If SFT is not confirmed in local inventory, do not advertise it as confirmed; default Fast and explain after interaction.
- Song focus stays optional and enabled only when local planner/LM inventory is confirmed.
- Never label requested checkpoint as actual without verification.

## Acceptance threshold (pre-hosted beta)

Before inviting external users onto hosted workers:

1. Blind preference for the proposed default tier meets the rubric threshold on the fixed pack (or documented exception with reasons).
2. Failure rate and latency budgets recorded for that tier under expected concurrency.
3. Capability advertising matches inventory (no false SFT / planner / XL claims).
4. See HOSTING_BOUNDARY.md for auth, isolation, quotas, and compute separation.
5. Ownership / local-mode messaging remains accurate for any remaining local path.

### Remote XL decision

Remote XL remains evaluation-only until it wins a documented, reproducible listening comparison against the verified local SFT baseline. Record the prompts, model identifiers, generation settings, blinded preference results, failure rate, and latency. Until this gate has been evaluated, do not build hosted authentication, multi-tenant queues, billing, or supported mobile clients.

## Local today

Continue using the local eval scripts on this machine.
Hosted eval farms stay out of scope until a hosting decision.
