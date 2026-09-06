# Audio Alchemy — Ethical Quality Improvement Plan

**Status:** Local quality tickets Q1–Q8 — implement in-app now.
**This pass:** UI/product-only (Create flow, truthful Turbo/SFT, metal packs, A/B eval, reference/LoRA plan doc). Hosted server work remains deferred.
**Hardware baseline:** RTX 3080 10GB, ACE-Step worker, Next.js API, single-flight GPU.
**Product stance:** Ownership-first product policy. Not legal advice. No Suno trademarks, trade dress, proprietary UX clones, training dumps, or comparison marketing claims.

Related: QUALITY.md, ROADMAP.md, CODEX.md, RUBRIC.md, .env.example.

---

## DEFERRED (do not implement in this quality pass)

Explicitly deferred — hosted / multi-user work from ROADMAP, not local Q1–Q8:

| Deferred item | Why deferred |
| --- | --- |
| Auth.js / Clerk / OAuth / magic-link | Multi-user foundation |
| Neon / Postgres / user_id tenancy | Hosted DB |
| Cloudflare R2 / S3 + signed URLs | Hosted audio |
| Pull GPU workers / Redis-BullMQ / SKIP LOCKED | Async scale-out |
| compute_provider (local/managed/byo_worker) cloud billing | Product + payments |
| Stripe / quotas / CDN / status page | Paid / public beta |
| Capacitor store signing | Mobile after hosted API |

Keep single-user SQLite + local ACE-Step. Do not start hosted scaffolding while finishing Q1–Q8.

---

## Goals

1. Fast vs Quality presets (Turbo vs 2B SFT-class); batch 1; no XL on 10GB.
2. Health + models probe with preset readiness.
3. Eval compare + rubric + blind A/B (>=55% to change defaults).
4. Structured prompt packs without artist names.
5. Post-FX: Windows FFMPEG_PATH now; Linux worker FX later (deferred with hosted workers).
6. Ethical LoRA/provenance/rejects documented; local allow-list only.

### Product-policy wording

> You own your generations (product policy). Tracks you create are yours to keep, download, and use according to the terms of the models and services you connect. This is not legal advice. Copyright and commercial use can depend on jurisdiction, checkpoint licenses, and how you distribute outputs. Audio Alchemy is independent and not affiliated with proprietary music platforms.

Do not say: Suno-quality, Suno alternative, copyright-free, or guaranteed commercial rights.

---

## 1. Fast vs Quality presets

| Preset | Checkpoint class | Steps | Batch | Thinking | Local 10GB |
| --- | --- | --- | --- | --- | --- |
| Fast | acestep-v15-turbo | 8 | 1 | false | Default |
| Quality | acestep-v15-sft | 32 (tune 24-50) | 1 | false | Opt-in |
| XL | acestep-v15-xl-* | — | — | — | Unsupported |

Env aliases: ACESTEP_MODEL_FAST, ACESTEP_MODEL_QUALITY, ACESTEP_PRESET_DEFAULT=fast,
ACESTEP_FAST_INFERENCE_STEPS=8, ACESTEP_QUALITY_INFERENCE_STEPS=32, ACESTEP_LOCAL_VRAM_GB=10.

Resolution order: explicit overrides -> preset -> env defaults. Reject XL with 400. Single-flight 409 unchanged.

### Health / models probe

GET /api/health returns safe { ok, mode, aceStep, settings, presets, models, postprocess } — no secrets.
Models from ACE GET /v1/models when reachable; else env-fallback. Mark XL supportedLocally false.

### API mapping

POST /api/generations accepts preset?: fast|quality plus existing Advanced overrides.
Client maps preset to model + inferenceSteps + batchSize 1 + thinking false into release_task.

## 2-8 Implementation notes
See also RUBRIC.md, scripts/eval/compare.mjs, src/lib/presets.ts, data/templates/packs/, datasets/PROVENANCE.csv. Tickets Q1-Q8 are implemented in-tree; hosted work remains DEFERRED above.

## Reference audio / LoRA

See docs/REFERENCE_AND_LORA_PLAN.md (plan only — no ingest or LoRA code in this pass).
