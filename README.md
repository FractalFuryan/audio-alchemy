# Audio Alchemy

Ownership-first AI music generation MVP. Create tracks from a prompt (optional lyrics + duration), play and download them, and keep generations on your machine.


## Features

- **Create** (`/`): prompt/style, optional lyrics, duration (30-180s), Generate
- **Library** (`/library`): list generations with status, play, download
- **Ownership** (`/ownership`): product policy — you own your outputs (not legal advice)
- **Generation modes**
  - `mock` (default): synthesizes a real WAV tone so play/download work end-to-end
  - `ace-step`: HTTP client for ACE-Step 1.5 REST API
- Local persistence under `data/` (SQLite + audio files)

## Stack

Next.js App Router, TypeScript, Tailwind CSS, React, better-sqlite3.

## Quick start

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open http://localhost:3000

Production build:

```bash
npm run build
npm start
```

## Environment

See `.env.example` (Phase D ACE-Step hardening):

| Variable | Description |
| --- | --- |
| `GENERATION_MODE` | `mock` (default) or `ace-step` |
| `ACESTEP_API_URL` | ACE-Step API base URL (e.g. `http://127.0.0.1:8001`) |
| `ACESTEP_API_KEY` | Optional API key (**server-only**; never returned by `/api/health`) |
| `HF_TOKEN` | Optional Hugging Face token fallback for auth (server-only) |
| `ACESTEP_MODEL` | Optional model / checkpoint name |
| `ACESTEP_INFERENCE_STEPS` | Inference steps (default `8`, modest for 10GB VRAM) |
| `ACESTEP_AUDIO_FORMAT` | `mp3` (default) / `wav` / `flac` / `opus` / `aac` |
| `ACESTEP_BATCH_SIZE` | Default `1` (keep on 10GB) |
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

**Single-flight:** in ace-step mode only one GPU job runs at a time. A second create/retry while another job is pending/processing returns **409** until it finishes or is cancelled. Protects RTX 3080 10GB VRAM.

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

## Push to GitHub

If the remote is empty:

```bash
cd audio-alchemy
git init
git add .
git commit -m "Initial Audio Alchemy MVP"
git branch -M main
git remote add origin https://github.com/FractalFuryan/audio-alchemy.git
git push -u origin main
```

## License notes

This app code is an MVP scaffold. ACE-Step upstream licensing is MIT / commercial-friendly per their project — always re-check the license and model cards for the checkpoints you run. Nothing on the Ownership page is legal advice.

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

Shell in src-tauri/. Product name Audio Alchemy. Id com.audioalchemy.app.
Dev loads local Next on port 3000 (see package.json scripts).
SQLite stays in the Node process.

Scripts: tauri:dev and tauri:build.
Windows host + WebView2 for shipping desktop binaries. Linux verifies scaffold only.

## Mobile (Capacitor)

UI shell only. Phones must use a hosted Next API URL — no on-device SQLite or ACE-Step.
Set CAPACITOR_SERVER_URL or edit server.url in capacitor.config.ts, then:

```
npm run cap:sync
npm run cap:android
npm run cap:ios
```

URL examples: Codespace port forward, ngrok/cloudflared tunnel, deployed host,
Android emulator http://10.0.2.2:3000, or adb reverse to localhost:3000.

## Architecture

See ARCHITECTURE.md for installables topology and phase status. Full brief: CODEX.md.

## Prompt templates

`GET /api/templates` serves `data/templates/prompts.json`. The Create page offers a dropdown and chips to apply a starter into prompt, style tags, lyrics, and duration (still editable).

## Quality / eval

See `QUALITY.md` for ffmpeg post-FX, templates, and the eval harness.

- Mock harness (no GPU): build the app, then use the eval:mock script
- Against a running server: set EVAL_BASE_URL and use the eval script
