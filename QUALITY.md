# Audio Alchemy — Quality notes

Local quality levers for Phase 0 (tickets 8–10). Not marketing copy.

## Ticket 8 — Optional ffmpeg post-FX

When POSTPROCESS=1 (or true), after mock or ACE-Step audio is written the server runs a CPU ffmpeg filter chain:

1. High-pass (~80 Hz, POSTPROCESS_HIGHPASS_HZ)
2. Gentle presence EQ (~2.5 kHz)
3. loudnorm (defaults I=-14, TP=-1.0, LRA=11)
4. True-peak limiter about -1 dBTP (POSTPROCESS_TRUE_PEAK_DB)

Behavior:
- Requires ffmpeg on PATH, or set FFMPEG_PATH to the binary (needed on Windows when Node cannot see WSL's ffmpeg). If post-FX is on but ffmpeg is missing: clear warning, skip, job still completes with original audio.
- If ffmpeg fails mid-run: keep original file; do not fail the generation.
- Progress stage during FX: postprocessing.

See .env.example for related variables.

## Ticket 9 — Prompt template pack

- Templates live in data/templates/prompts.json (about 12 genre/mood starters).
- Public route GET /api/templates returns the list with no secrets.
- Create UI dropdown and chips apply prompt, style, lyrics, and duration; user can still edit.

## Ticket 10 — Eval harness v0

Fixed pack: scripts/eval/prompts.json (20 diverse prompts).

### Mock mode (no GPU)

Build the app, then use the eval:mock script (`scripts/eval/mock.mjs` sets GENERATION_MODE=mock, then starts a temporary Next server).
Outputs land under scripts/eval/results/{runId}/ including manifest.csv, audio/, meta.json.

CSV columns include id, prompt, path, duration, mode, notes, empty human score columns
(score_adherence, score_coherence, score_mastering), optional loudness_lufs, status, generation_id.

When ffmpeg is present, fill-loudness.py may fill loudness_lufs as a stub automatic metric.

### Against a running Next server

Export EVAL_BASE_URL (example http://127.0.0.1:3000) and GENERATION_MODE, then run the eval script.

### Against local ACE-Step

1. Start the ACE-Step API (often port 8001).
2. Run Next with GENERATION_MODE=ace-step and ACESTEP_API_URL set. Optional: POSTPROCESS=1.
3. Point EVAL_BASE_URL at that Next server with GENERATION_MODE=ace-step and run the eval script.

Long wall time is expected. EVAL_TIMEOUT_MS defaults to about 10 minutes per prompt in ace-step mode.
Prompts run sequentially so single-flight VRAM protection still applies.

### Comparing two configs

Run twice with different env (checkpoint or POSTPROCESS off vs on), then compare manifest.csv
and listen to audio/ side by side. Add preference notes in the notes column or a separate sheet.

## Quality plan (Q1-Q8)

See QUALITY_PLAN.md (local presets, eval:compare, packs, FFMPEG_PATH). This pass is UI/product only; hosted multi-user work remains DEFERRED. See also docs/REFERENCE_AND_LORA_PLAN.md.

## Rubric

See RUBRIC.md and scripts/eval/blind_ab_template.csv. Blind A/B ship threshold: 55% excluding ties.

## Optional remote XL path

See docs/REMOTE_XL_EVAL.md. Default remains local 2B SFT/Turbo on 10GB.
Set QUALITY_TIER=remote-xl-sft and ACESTEP_REMOTE_URL only when evaluating XL on a separate 20–24GB endpoint. Health exposes capability ids (local-2b-* / remote-xl-*); UI labels actual model only when confirmed.

