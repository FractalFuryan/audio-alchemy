# Audio Alchemy — Codex brief

This document is the full project brief for Codex (and humans) working on Audio Alchemy, including the native-apps plan (PWA, Tauri, Capacitor).

## Product goal

Ownership-first AI music app. Users create tracks from prompts (optional lyrics + duration), play/download them, and keep generations on their machine or account. Brand: **Audio Alchemy**.

Real generation targets **ACE-Step** (remote or local API). Default MVP mode is **mock** (synthesized WAV) so UI works without a GPU.

## Principles

- Ownership-first messaging (not legal advice); users keep their outputs.
- Heavy model inference stays on ACE-Step API (server/desktop GPU) — *not on phone GPUs*.
- Mobile/desktop shells load the UI; API + Sqlite + ACE-Step stay on a Node/Next host.
- Do **not** copy Suno IP, branding, or proprietary UX clones.
- Prefer practical MVPs over perfect bundling (local Next + webview shells).

## Stack

- Next.js 15 App Router, TypeScript, Tailwind CSS, React 19
- better-sqlite3 (local persistence under data/)
- Generation: mock WAV synthesizer or ACE-Step HTTP client
- PWA: Web App Manifest (src/app/manifest.ts) + minimal custom service worker (public/sw.js)
- Desktop: Tauri 2 (src-tauri/) loading the local Next server
- Mobile: Capacitor 7 (android/, ios/) UI shell -> hosted Next API

## Routes

| Route | Purpose |
| --- | --- |
| / | Create form (prompt, title, lyrics, style, duration; `?id=` job link) |
| /library | Search/filter/sort library; play / download / cancel / retry / delete / rename / clear failed |
| /ownership | Ownership policy copy |
| /manifest.webmanifest | PWA manifest (generated) |
| /api/generations | GET list (`q`/`status`/`sort`; reconciles), POST create |
| /api/generations/clear-failed | POST delete failed+cancelled + unlink audio |
| /api/generations/[id] | GET (reconcile), PATCH title/cancel, DELETE row+audio |
| /api/generations/[id]/retry | POST in-place retry |
| /api/audio/[id] | Stream/download audio file |
| /api/health | `{ ok, mode, aceStep, settings }` — no secrets (booleans + safe settings) |
| /api/templates | GET prompt template pack (public, no secrets) |

## API sketch

- POST /api/generations body: `{ prompt, lyrics?, style?, title?, durationSec }` → generation (returns after ACE-Step `release_task` or mock complete)
- GET /api/generations → list (runs `reconcileOpenJobs` first). Query: `q`, `status` (comma list), `sort` (`created_at_desc` default | `created_at_asc` | `title_asc` | `title_desc` | `duration_desc`)
- GET /api/generations/[id] → one generation (reconciles)
- PATCH /api/generations/[id] body: `{ title? }` and/or `{ cancel: true }`
- POST /api/generations/[id]/retry → clear audio/error, new task
- DELETE /api/generations/[id] → DB row + unlink audio (basename under audio dir)
- POST /api/generations/clear-failed → delete all failed+cancelled rows + unlink audio
- Statuses: `pending` | `processing` | `completed` | `failed` | `cancelled`
- Audio served from data/audio/ via /api/audio/[id]

## Job durability (Phase A — done)

Jobs survive process restarts by persisting `external_task_id` and reconciling on GET:

1. **create** inserts `pending`; ace-step health-gates, calls `release_task`, saves task id, sets `processing` / stage `queued`, returns immediately.
2. **mock** completes in-request (~sub-second WAV) so restarts never leave mock rows stuck.
3. **reconcileGeneration / reconcileOpenJobs** poll ACE-Step `query_result`, update progress fields, download audio on success, mark failed/cancelled as needed.
4. Processing without a task id after restart → failed: `"Interrupted before ACE-Step task was submitted"`.
5. Cancel is best-effort (no ACE cancel API): set `cancelled` and stop finalizing.

## Library management (Phase B — done)

1. **ACE-Step metadata** shown under completed tracks when present: duration (`audio_duration_sec`), BPM, key, model, seed, generation time (`generation_ms`).
2. **Filter / search / sort**: `GET /api/generations?q=&status=&sort=` (parameterized SQL in `db.ts`); Library UI search input, status chips, sort select.
3. **Clear failed**: `POST /api/generations/clear-failed` bulk-deletes failed+cancelled and unlinks audio safely; Library button with confirm.
4. Delete confirm + rename Enter/Escape polish kept alongside Phase A poll/cancel/retry.

## Better Create experience (Phase C — done)

1. **Title helper**: `titleFromPrompt` in `src/lib/title.ts` strips filler, takes first clause, Title Case, ~56 char max; used by server create and client CreateForm preview/prefill (editable before generate).
2. **CreateForm layout**: labeled sections for prompt, title, style tags (suggestions + chips), lyrics, duration slider with value; collapsed Advanced shows mode/health (read-only, no keys).
3. **Progress / disabled UX**: fetches `/api/health`; badge for mode; ace-step unhealthy warns and disables Generate; form disabled while posting/open job; progress bar + poll; `/?id=` loads linked job progress.
4. **Mock WAV**: `synthesizeMockWav` plays a short multi-note/chord progression (pad + arp + bass), honors duration with ~16s cap for snappiness.

## ACE-Step hardening (Phase D — done)

Env-driven inference settings, single-flight GPU jobs, safe `/api/health` (no secrets), path/metadata hardening in the ACE-Step client.

## Exploratory client shells (Phase E scaffold)

1. **PWA**: Manifest id/scope, maskable icon, branded icons, SW v2 (no `/api` cache), production SW registration.
2. **Tauri 2**: exploratory desktop scaffold only; packaging, signing, updates, sidecar lifecycle, and release support are future work.
3. **Capacitor**: exploratory Android/iOS shells only; they require a deliberately hosted secure API and are not supported releases.
4. **Docs**: `ARCHITECTURE.md` + README install steps.

## Quality pack (tickets 8–10 — done)

1. **ffmpeg post-FX**: optional `POSTPROCESS=1` after mock/ACE audio write; stage `postprocessing`; skip (keep original) if ffmpeg missing/fails.
2. **Prompt templates**: `data/templates/prompts.json` + `GET /api/templates` + Create UI apply chips.
3. **Eval harness v0**: `scripts/eval/` prompts + eval:mock script → `results/{runId}/manifest.csv` for human scores.

See QUALITY.md.

### Remaining

- **F** — Auth / multi-device sync (explicitly out of MVP scope for now)
- Optional follow-ups: models list / richer progress, Next sidecar, Windows CI, mobile safe-area/audio plugin

## Source map

| Path | Role |
| --- | --- |
| src/app/* | App Router pages + API routes |
| src/components/* | CreateForm, GenerationList, AudioPlayer, Header, ServiceWorkerRegister |
| src/lib/db.ts | SQLite schema + additive migrations + queries |
| src/lib/generation.ts | Durable job pipeline (create / reconcile / cancel / retry / delete / clear-failed) |
| src/lib/ace-step-client.ts | REST client for ACE-Step (path/metadata hardening) |
| src/lib/ace-step-settings.ts | Env + override inference settings; safe health summary |
| src/lib/title.ts | Shared titleFromPrompt (server + client) |
| src/lib/wav.ts | Mock WAV synthesizer (chord progression demo) |
| src/lib/postprocess.ts | Optional ffmpeg CPU post-FX |
| src/lib/templates.ts | Load prompt template pack |
| data/templates/prompts.json | Genre/mood prompt templates |
| scripts/eval/* | Eval harness v0 |
| QUALITY.md | Post-FX, templates, eval docs |
| src/lib/paths.ts | Data directory helpers |
| src/lib/types.ts | Shared types |
| public/sw.js | Minimal SW for installability |
| public/icons/* | PWA / app icons |
| src-tauri/* | Tauri 2 desktop shell |
| desktop-dist/ | Static fallback shell for Tauri bundle + Capacitor webDir |
| capacitor.config.ts | Capacitor appId / server URL |
| android/, ios/ | Native Capacitor projects |

## Environment variables

See .env.example (Phase D):

| Variable | Description |
| --- | --- |
| GENERATION_MODE | mock (default) or ace-step |
| ACESTEP_API_URL | ACE-Step API base |
| ACESTEP_API_KEY | Optional API key (server-only) |
| HF_TOKEN | Optional Hugging Face token fallback (server-only) |
| ACESTEP_MODEL | Optional model name |
| ACESTEP_INFERENCE_STEPS | Default 8 |
| ACESTEP_AUDIO_FORMAT | Default mp3 |
| ACESTEP_BATCH_SIZE | Default 1 |
| ACESTEP_THINKING | Default false |
| ACESTEP_POLL_INTERVAL_MS | Default 2000 |
| ACESTEP_TIMEOUT_MS | Default 600000 |
| DATA_DIR | Optional data directory override |

Single-flight for ace-step is always on (no env toggle).

## Run commands

See package.json scripts for dev, build, start, native helpers, and eval:mock / eval.

## Native apps plan

See also ARCHITECTURE.md.

### Architecture
PWA, Tauri window, and Capacitor WebView load UI and call Next.js API on a Node host. SQLite and ACE-Step stay on that host. Mobile WebView does not run App Router API routes or better-sqlite3.

### PWA
Manifest in src/app/manifest.ts; SW at public/sw.js. Chrome/Edge/Android can Install app. iOS is Add to Home Screen only with limited SW.

### Tauri Windows desktop
src-tauri wraps the local Next UI. Prefer tauri:dev for MVP. Production installer expects a running Next server rather than embedding SQLite in Rust.

### Capacitor Android and iOS
Capacitor is a UI shell only. Set server.url to a hosted Next backend. android and ios folders are scaffolded. iOS CocoaPods needs macOS.

### Why models do not run on phones
ACE-Step needs server or desktop GPU stacks. Phones stream results from the hosted API.

### Phased roadmap
1. PWA exploration — scaffolded.
2. Tauri Windows shell — exploratory; Next sidecar, packaging, signing, and release support remain open.
3. Capacitor shells — exploratory; production HTTPS, safe-area, audio plugins, store signing, and support remain deferred until the audio-quality gate.
4. Multi-device sync via hosted DB if needed (Phase F).
5. Optional local ACE-Step beside desktop.

### Constraints
- No Suno IP, trademark, or trade-dress copy.
- Ownership page is product policy, not legal advice.
- Re-check ACE-Step licenses when upgrading checkpoints.

## Suggested next Codex tasks
1. Production Capacitor HTTPS CAPACITOR_SERVER_URL + store signing.
2. Optional Next sidecar for packaged desktop builds.
3. Mobile safe-area CSS and background audio plugin.
4. Windows CI for tauri build artifacts.
5. Optional ACE-Step /v1/models picker in Advanced.
6. Desktop helper script if tauri:dev beforeDevCommand is not enough.
