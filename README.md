# Audio Alchemy

Audio Alchemy is a **local-first, ownership-first music-generation MVP** built around an optional [ACE-Step 1.5](https://github.com/ace-step/ACE-Step-1.5) service.

- **Mock** works without a GPU so the product flow can be explored end to end; its synthesized demo audio is not representative of model quality.
- **Quality** uses a verified local ACE-Step SFT checkpoint when one is installed and is the preferred local setting.
- **Fast** uses a verified Turbo checkpoint for quicker drafts.
- Output capability and quality depend on the model and worker you configure. This project does **not** claim Suno-equivalent quality.
- Prompts and templates avoid artist names and artist imitation.
- “You own your generations” is an Audio Alchemy product policy, not legal advice; applicable law and third-party model terms still matter.
- The owner’s home GPU is private development hardware and must never be exposed or routed to as public compute.

## Features

- **Create** (`/`): direct generation or optional Song Focus planning, editable prompts, lyrics, style, duration, and quality presets
- **Library** (`/library`): play and download tracks; organize favorites, collections, and tags; create variations; export metadata
- **Ownership** (`/ownership`): product policy — you own your outputs (not legal advice)
- **Generation modes**
  - `mock` (default): synthesizes a real WAV tone so play/download work end-to-end
  - `ace-step`: HTTP client for ACE-Step 1.5 REST API
- Local persistence under `data/` (SQLite + audio files)

## Stack

Next.js App Router, TypeScript, Tailwind CSS, React, better-sqlite3.

## Quick start

macOS/Linux:

```bash
cp .env.example .env.local
npm install
npm run dev
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
npm.cmd install
npm.cmd run dev
```

Use `npm.cmd` as the Windows fallback when PowerShell blocks the `npm.ps1` script under its execution policy.

Open http://localhost:3000

Production build:

```text
npm run build
npm start
```

On Windows, the equivalents are `npm.cmd run build` and `npm.cmd start`.

## Environment

See `.env.example` for all supported settings:

| Variable | Description |
| --- | --- |
| `GENERATION_MODE` | `mock` (default) or `ace-step` |
| `ACESTEP_API_URL` | ACE-Step API base URL (e.g. `http://127.0.0.1:8001`) |
| `ACESTEP_API_KEY` | Optional API key (**server-only**; never returned by `/api/health`) |
| `HF_TOKEN` | Optional Hugging Face token fallback for auth (server-only) |
| `ACESTEP_MODEL` | Optional model / checkpoint name |
| `ACESTEP_INFERENCE_STEPS` | Inference steps used when no preset-specific override is configured |
| `ACESTEP_AUDIO_FORMAT` | `mp3` (default) / `wav` / `flac` / `opus` / `aac` |
| `ACESTEP_BATCH_SIZE` | Default `1`; increase only when the generation worker has sufficient VRAM |
| `ACESTEP_THINKING` | Default `false` (thinking uses more VRAM) |
| `ACESTEP_POLL_INTERVAL_MS` | Poll interval for `generateAndWait` (default `2000`) |
| `ACESTEP_TIMEOUT_MS` | Job timeout during reconcile (default `600000`) |
| `DATA_DIR` | Optional override for the data directory |
| `POSTPROCESS` | `0` (default) or `1`/`true` — optional ffmpeg CPU post-FX |
| `POSTPROCESS_LOUDNORM_I` | Loudnorm target LUFS (default `-14`) |
| `POSTPROCESS_LOUDNORM_TP` | Loudnorm true-peak target (default `-1.0`) |
| `POSTPROCESS_LOUDNORM_LRA` | Loudnorm LRA (default `11`) |
| `POSTPROCESS_HIGHPASS_HZ` | High-pass Hz (default `80`) |
| `POSTPROCESS_TRUE_PEAK_DB` | Limiter ceiling dBTP (default `-1`) |

**Single-flight:** in ACE-Step mode, only one GPU job runs at a time by default. A second create or retry while another job is active returns **409** until the first job finishes or is cancelled. This provides a safe default for consumer GPUs.

**Secrets:** Generation always goes through Next.js API routes. /api/health returns { ok, mode, aceStep, settings } — booleans and safe settings only (no API keys).

## Wire ACE-Step 1.5

1. Install and run the ACE-Step API from https://github.com/ace-step/ACE-Step-1.5 (check their current docs):

```bash
uv sync
uv run acestep-api
# or: python -m acestep.api_server
```

Default listen address in upstream docs is often `127.0.0.1:8001`.

2. Point Audio Alchemy at it:

```bash
GENERATION_MODE=ace-step
ACESTEP_API_URL=http://127.0.0.1:8001
# ACESTEP_API_KEY=your-secret
```

3. Restart the Next.js dev server.

### Client endpoints used

Best-effort TypeScript client in `src/lib/ace-step-client.ts`:

- `POST /release_task` — submit generation
- `POST /query_result` — poll until status `1` (ok) or `2` (failed)
- `GET /v1/audio?path=...` — download audio
- `GET /health` — health check

## Data

- SQLite DB: `data/audio-alchemy.db`
- Audio files: `data/audio/`
- `data/` is gitignored (except `.gitkeep`)

## License notes

Audio Alchemy’s original application source is available under the [MIT License](LICENSE). That license applies only to source owned by this project; it does not relicense ACE-Step, model checkpoints, npm packages, platform SDKs, or connected services. Review [Third-party notices](THIRD_PARTY_NOTICES.md) and the current upstream terms before use. Ownership-page language remains product policy, not legal advice.

## Progressive Web App (PWA)

Installable via Web App Manifest + service worker.

| Piece | Path |
| --- | --- |
| Manifest | src/app/manifest.ts |
| Icons | public/icons/ (192, 512, maskable, SVG, apple-touch) |
| Service worker | public/sw.js (never caches /api) |
| Registration | ServiceWorkerRegister (production only) |

### How to install

Use a production server, then install from Chrome or Edge.
Android: add from the browser menu. iOS Safari: use Share.
Dev server skips service worker registration.

## Desktop (Tauri 2)

`src-tauri/` is an **exploratory desktop shell**, not a polished or supported release. It currently loads the Next.js application while SQLite remains in the Node process. Packaging, sidecar lifecycle, updates, signing, release CI, and installer support remain future work.

## Mobile (Capacitor)

`android/`, `ios/`, and `capacitor.config.ts` are **exploratory mobile shells**, not polished or supported releases. They do not run SQLite or ACE-Step on-device and would require a deliberately hosted, secured API. Hosted infrastructure and mobile-client work are deferred until the audio-quality gate is evaluated.

## Architecture

See ARCHITECTURE.md for installables topology and phase status. Full brief: CODEX.md.

## Prompt templates

`GET /api/templates` serves `data/templates/prompts.json`. The Create page offers a dropdown and chips to apply a starter into prompt, style tags, lyrics, and duration (still editable).

## Quality / eval

See `QUALITY.md` for ffmpeg post-FX, templates, and the eval harness.

- Mock harness (no GPU): build the app, then use the eval:mock script
- Against a running server: set EVAL_BASE_URL and use the eval script
