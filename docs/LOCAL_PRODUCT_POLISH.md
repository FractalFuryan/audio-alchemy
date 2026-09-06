# Local product polish

UI/product polish for the single-user Audio Alchemy MVP. Not the hosted ROADMAP phases (auth, queues, billing).

Visual baseline: Create UI deep-plum / purple / gold (see public/brand/_current-ui-reference.png). Polish that language; do not redesign from scratch or add new design libraries.

## Phase 2 - Visual system + Create progress + PWA (DONE)

Completed earlier:

1. Theme - Deep plum (#120715), purple surfaces, gold accents on Create, Library, Ownership, empty states, system status, and mobile-width layout (max-w-2xl / max-w-3xl).
2. A11y - Global :focus-visible rings; readable success (#34d399) / danger (#f87171) / gold warning colors preserved.
3. Hierarchy - Shared .aa-card / .aa-btn / .aa-btn-primary / .aa-empty utilities; less visual clutter; stacked Create then Result matching the baseline screenshot.
4. Create in-progress - Stage, progress bar/pct, actual model/provider via resolveDisplayModelLabel (requested never shown as if it already ran), cancel + retry.
5. PWA - Manifest/themeColor #120715; icons regenerated from flask/note brand mark; install-friendly standalone layout.
6. Brand assets - public/brand/audio-alchemy-logo.png, audio-alchemy-mark.png (+ SVG). Header uses /brand/audio-alchemy-mark.png.
7. Pins - better-sqlite3@13.0.3 unchanged. No cloud/auth/billing/queues. Remote XL truthful safeguards unchanged. No Suno branding.

## Phase 3 - Music-library workflow (DONE)

Local-only library depth on the existing plum/gold system:

1. Favorites - toggle + filter; SQLite generations.favorite.
2. Collections/folders - local collections table; delete unfiles tracks only.
3. User tags - JSON user_tags editable in detail drawer.
4. Search - title, prompt, lyrics, style tags, user tags, collection name.
5. Track detail drawer - full metadata; confirmed model only (never requested-as-actual).
6. Generate variation - prefills Create; new seed via use_random_seed.
7. Metadata export JSON download beside audio.
8. Non-destructive SQLite migrations for favorite/user_tags/collection_id + collections table.
9. better-sqlite3 13.0.3 unchanged; local-only; remote XL safeguards preserved.

### Verify

npm run test:unit
npm run build

### Migration notes

- migrateGenerations + migrateCollections on DB open.
- Defaults: favorite=0; tags/collection null.
- Deleting a collection nulls collection_id; keeps tracks/audio.


## Phase 4 - Local quality workflow (DONE)

Improve control and repeatability — not a quality miracle. Local-only; no LoRA, external music ingestion, or reference-audio upload.

1. Optional post-processing panel on Create (dedicated collapsible; default collapsed).
2. ffmpeg detection via FFMPEG_PATH / PATH; health + UI show Windows setup hint when missing.
3. Post-FX disabled by default (off). Missing/failing ffmpeg skips FX; generation still completes.
4. Presets: Off, Light polish (HPF + presence EQ + soft limiter), Loudness normalize (loudnorm + limiter). Maps to existing postprocess env; optional POSTPROCESS_PRESET when POSTPROCESS=1.
5. Fine-tune honesty: preset, step count, duration, seed/variation, requested vs actual model (actual only when confirmed).
6. Structured prompt templates extended (genre/arrangement/instrumentation/production language). Metal pack kept. No artist-name imitation.
7. better-sqlite3@13.0.3; XL safeguards; purple/gold theme; non-destructive post_fx_preset column.

### Verify

npm run test:unit
npm run build


## Phase 5 - Local reliability and future readiness (DONE)

Completes the local polish roadmap: diagnostics, portable library backup, and clearer failures.

1. Diagnostics panel on Create and Library.
2. Library backup export and import with conflict skip or rename.
3. Actionable failure messages for offline, busy GPU, missing audio, disk issues.
4. Extended unit tests for diagnostics redaction and backup import.
5. better-sqlite3 13.0.3 unchanged; local-only; XL safeguards; purple/gold theme.

### Archive layout

- manifest.json with schema audio-alchemy.library-backup.v1
- audio files under audio/
- README.txt

### Verify

npm run test:unit
npm run build

### Migration notes

- No new SQLite columns for Phase 5 (backup is file-based).
- Phases 3-4 migrations remain non-destructive on DB open.

### Local-only boundaries (full)

- No auth, accounts, cloud sync, multi-tenant queues, or billing.
- Persistence under ./data (SQLite + audio). Optional DATA_DIR.
- Secrets stay server-side; never returned by health.
- Hosted multi-user remains DEFERRED (ROADMAP.md / QUALITY.md).

### Intentionally deferred

- Hosted auth / multi-user queues / billing.
- LoRA, reference-audio upload, external music ingestion.
- Cloud sync of library backups; remote object-store / PITR.
- Separate install/onboarding visual QA package (PWA/Tauri already scaffolded).

Local polish Phases 2-5 are complete.

## Song focus (local ACE planner) — DONE

Optional Create planning path. Local-only; no cloud LLM / Ollama.

### Direct (default)

- Submits the user prompt (+ style tags) as today.
- `thinking: false`.
- No silent planner claim.

### Song focus

- Uses a **deterministic prompt compiler** (not an LLM) to organize the prompt into an editable music brief: core sound, energy/mood, arrangement, production, constraints. Lyrics stay separate. Style tags are deduped; conflicts with the prompt show a warning + one-click Clear conflicting tags.
- Submits the final brief with `thinking: true` so the **local ACE planner / 0.6B LM** can improve structure and prompt adherence.
- Slower than Direct. Prompt stays on this machine.
- **Enabled only when** health confirms ACE connected **and** local model inventory reports an LM/planner id.

#### Planner detection heuristic (`local-inventory-lm-planner-v1`)

1. `GENERATION_MODE=ace-step` and ACE `/health` reachable.
2. Live local `/v1/models` inventory (not env-fallback alone).
3. A local model id matches: `planner`, bounded `lm`, `thinking`, `0.6b`/`06b`, `language-model`, `ace-lm`.
4. Remote-only matches do not enable Song focus.
5. If unavailable: control explains why; Generate stays blocked until the user picks **Direct** — no silent fallback while Song focus remains selected.

### Persistence (non-destructive)

SQLite columns on `generations`:

- `planning_mode` — `direct` | `song-focus`
- `original_prompt` — user typed prompt (Song focus)
- `music_brief` — final submitted brief (Song focus)

Never store or display model chain-of-thought. Library / track detail show Direct vs Song focus, original prompt, music brief, and confirmed model/provider only.

### Pins / safeguards preserved

- Phases 2–5 polish unchanged (theme, library, post-FX, diagnostics/backup).
- Remote XL truthful routing unchanged.
- Fast/Turbo and Quality/SFT labeling remains truthful (requested ≠ actual until confirmed).
- `QUALITY_TIER=local-sft` default.
- `better-sqlite3@13.0.3`.
- Brand assets + purple/gold UI.

### Verify

```bash
npm run test:unit
npm run build
```

### Intentionally deferred

- Cloud LLM / Ollama planning.
- Exposing ACE chain-of-thought in UI or SQLite.
- Artist-name imitation or unsupported ACE fields (e.g. `negative_prompt`).

