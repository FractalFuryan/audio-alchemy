# Audio Alchemy — Local MVP → Public Product Roadmap

Ownership-first AI music product. Not a Suno clone: no Suno trademarks, UI copying, proprietary code, training dumps, or comparison marketing claims.

**Current baseline:** Next.js 15 + SQLite + local ACE-Step 1.5 (Turbo, batch 1, 8 steps) on WSL / RTX 3080 10GB. Phases A–E complete (durable jobs, library, Create UX, ACE hardening, PWA/Tauri/Capacitor scaffolds). Single-user, local-first.

**Invariant:** Clients → hosted Next/API → ACE-Step GPU workers. Mobile never runs SQLite or ACE-Step. Ownership language = product policy, not legal advice.

**Compute security:** Never expose WSL/home ACE-Step as a public HTTP endpoint. Hosted API only **enqueues** jobs; GPU workers **pull** from the queue (outbound connect). Dave's RTX 3080 is a personal/local/dev worker — not a shared public render farm.

**`compute_provider` on every generation/job:**
| Value | Meaning |
|---|---|
| `local` | User's personal desktop/WSL ACE-Step worker |
| `managed` | Audio Alchemy cloud GPU pool (rented), billed/credited to the user |
| `byo_worker` | User-registered private worker (advanced, later) |

Hosted API coordinates auth, libraries, credits/payments, jobs, and storage — then routes each job to the user's chosen compute. GPU cost is a user/use-case decision.


## DEFERRED (hosted / multi-user — not part of local quality Q1–Q8)

Do **not** implement these while finishing local quality tickets. Later milestones only:

- Auth.js / Clerk / OAuth / magic-link
- Neon / Postgres / user_id tenancy
- Cloudflare R2 / S3 + signed URLs
- Pull GPU workers / Redis–BullMQ / SKIP LOCKED
- compute_provider (local / managed / byo_worker) cloud billing
- Stripe / quotas / CDN / status page
- Capacitor store signing

Local quality (presets, eval compare, prompt packs, FFMPEG_PATH) stays on single-user SQLite + local ACE-Step. See QUALITY_PLAN.md.



---

## 1. Phased roadmap

### Phase 0 — Stabilize local (1–2 weeks)
- Keep local single-user path working (dev + Tauri).
- Add `QUALITY.md` + eval harness stubs.
- Checkpoint bake-off (Turbo vs SFT vs Base) with fixed prompts.
- Optional ffmpeg post-FX pipeline (CPU).
- **Exit:** Documented best local settings; no regressions on A–E.

### Phase 1 — Multi-user foundation (2–4 weeks)
- Auth (email magic link or OAuth).
- Postgres (multi-tenant) replacing SQLite for hosted mode.
- S3-compatible object storage for audio (+ optional artwork).
- Feature-flag: `STORAGE_BACKEND=fs|s3`, `DB=sqlite|postgres` so local mode survives.
- User-scoped library APIs (`user_id` on every generation).
- **Exit:** Two test users; isolated libraries; hosted API enqueues jobs; a **pull-based** private worker (e.g. invite-only 3080) claims jobs — WSL ACE never publicly exposed.

### Phase 2 — Async scale-out (3–5 weeks)
- Job queue (Redis + BullMQ or Postgres `SKIP LOCKED`).
- GPU worker process(es) separate from web API.
- Idempotent job keys; progress events (SSE or poll); cancel/retry across workers.
- Quotas + rate limits per plan (free tier).
- Basic observability (structured logs, job metrics, error tracking).
- **Exit:** API can restart without killing GPU work; queue drains cleanly; free-tier caps enforced.

### Phase 3 — Closed beta (2–4 weeks)
- Invite-only signup; ToS / Privacy / Ownership policy pages (product + counsel review).
- Abuse: report button, takedown workflow stub, upload virus/size limits.
- Quality pack: prompt templates, CC0 reference pack (documented provenance), 1–2 small LoRAs.
- Mobile: Capacitor → staging HTTPS API only.
- **Exit:** 20–50 external users; P50 latency + failure rate known; no data leaks across tenants.

### Phase 4 — Public beta (4–6 weeks)
- Self-serve signup; email verification; password reset.
- Hosted GPU path (RunPod / Vast / Modal / managed) with autoscale 0→N.
- Billing-ready metering (usage events) even if payments later.
- CDN for audio downloads; signed URLs.
- Status page + on-call basics.
- **Exit:** Public URL; waitlist optional; SLO draft (availability, queue wait).

### Phase 5 — Paid / production readiness (4–8 weeks)
- Stripe (or similar) plans: generations/month, max duration, concurrent jobs.
- Cost controls: queue priority, model tier (fast vs quality), spend alerts.
- Hardening: backups, PITR, secret rotation, WAF/bot limits, GDPR export/delete.
- App Store / Play only after hosted API is stable (Capacitor).
- Windows installer with clear “needs account + cloud GPU” or optional local sidecar doc.
- **Exit:** Paid conversion path; runbooks; counsel-reviewed policies; support mailbox.

---

## 2. Target architecture

```
[Web PWA / Tauri / Capacitor]
        | HTTPS
[Next.js API — auth, quotas, signed URLs]
        |
[Postgres]     [Redis/queue]     [S3-compatible audio]
        \           |              /
         \          v             /
          [GPU Worker(s) — ACE-Step]
                    |
              [optional CPU post-FX]
```

### Auth & accounts
- Provider: Clerk, Auth.js, or Supabase Auth (pick one; don’t roll crypto).
- Sessions via httpOnly cookies; API routes require `user_id`.
- Roles later: `user`, `admin` (takedowns).

### Multi-tenant database
- Postgres tables: `users`, `generations` (+ existing job fields), `usage_events`, `api_keys` (optional), `reports`.
- Every generation row: `user_id NOT NULL`, indexes `(user_id, created_at DESC)`.
- Row-level security if using Supabase; otherwise enforce in query layer only.

### Object storage
- S3 / R2 / MinIO: `audio/{user_id}/{generation_id}.mp3`, optional `art/…`.
- DB stores object keys + mime + bytes + checksum; never trust client paths.
- Downloads via short-lived signed URLs.

### Async jobs & GPU pool
- Enqueue on `POST /generations` after quota check; return `generation_id` immediately.
- Worker: claim job → health check ACE → `release_task` → poll → download → post-FX → upload S3 → mark completed.
- Persist `external_task_id`, stage, progress (already in MVP).
- Horizontal: N workers, one ACE process per GPU; single-flight per GPU.

### Progress / retry / cancel / idempotency
- Idempotency-Key header on create (24h unique per user).
- Cancel: set `cancel_requested`; worker stops finalize; best-effort ACE cancel if available.
- Retry: new attempt_count; new task id; don’t double-charge if using wallet (dedupe).
- Client: poll or SSE `GET /generations/:id/events`.

### Rate limits / quotas
- Free: e.g. N gens/day, max duration 120s, 1 concurrent job.
- Redis token bucket + DB daily counters.
- Return 429 with `Retry-After`.

### Observability & failures
- Structured logs: `request_id`, `user_id`, `generation_id`, `task_id`.
- Metrics: queue depth, GPU busy, success/fail, P50/P95 latency, VRAM OOM count.
- Alert on queue age > threshold, worker heartbeat miss, S3 error rate.
- Dead-letter status `failed` with sanitized error for user + full error in logs.

---

## 3. Quality roadmap (ROI order)

| Priority | Lever | Effort | Perf impact on 3080 | Notes |
|---|---|---|---|---|
| 1 | Checkpoint bake-off (Turbo vs SFT vs Base) + fixed prompt suite | Low | Neutral/better | Pick defaults per “fast” vs “quality” tier |
| 2 | Prompt/lyrics templates (genre packs, structure tags) | Low | None | Biggest UX win per hour |
| 3 | CPU ffmpeg post-FX (HPF, EQ, loudnorm, limiter) | Low | GPU unchanged | Fixes thin/gamey masters |
| 4 | Curated CC0/RF reference pack (provenance CSV) | Medium | None until used | For covers / style refs only |
| 5 | Reference/cover conditioning (user or curated RF) | Medium | Similar to one gen | Legal gate on uploads |
| 6 | Small LoRAs (8–30 tracks, documented CC0/RF) | Medium | Tiny at inference | One LoRA per genre max at first |
| 7 | Eval harness (objective + blind preference) | Medium | N/A | Prevents quality regressions |
| 8 | Hosted stronger GPU / multi-step quality tier | Higher cost | Local optional | Separate SKU |

**Do not:** live vector-DB RAG over raw audio; scrape YouTube/artist catalogs; “Suno-style” dumps; Jamendo/FMA bulk train without license fit.

---

## 4. What “commercial-quality” means (internal metrics, not ads)

Avoid public “closer to Suno” claims. Internally track:

| Dimension | Metric | Target direction |
|---|---|---|
| Prompt adherence | Blind raters 1–5 + tag checklist (genre, mood, instruments) | ↑ mean, ↓ variance |
| Arrangement coherence | Section structure present; few hard cuts; loopability score | ↑ |
| Vocal intelligibility | Lyrics intelligibility 1–5; optional ASR word error on chorus | ↑ / ↓ WER |
| Mastering / loudness | Integrated LUFS ~−14 to −9; true peak ≤ −1 dBTP; low harshness | In band |
| Latency | Queue wait + gen time P50/P95 by tier | Fast tier low; quality tier allowed higher |
| Preference | Pairwise A/B (new vs baseline) with ≥20 listeners | Win rate ≥55% to ship default change |

Ship a default only when eval harness + small human panel agree.

---

## 5. Data & licensing policy outline

### User-uploaded references
- Allowed only with explicit checkbox: “I have rights to use this for conditioning.”
- Size/type limits; malware scan; store under user prefix; not used to train global models without separate opt-in.
- Reject clear copyright-forbidden patterns via policy + later hash matching if needed.

### CC0 / RF LoRA datasets
- Maintain `datasets/PROVENANCE.csv`: URL, license, date retrieved, hash, curator.
- Only CC0 / explicit RF / licenses allowing derivatives + commercial ML use.
- Publish model card for each LoRA (data summary, intended use, limitations).

### Generated outputs
- Product policy: users own their generations (not legal advice; counsel reviews).
- Retain server copies per retention policy; user can delete (DB + object).
- No claim that outputs are “copyright-free worldwide.”

### Takedown / reporting
- In-app Report on any track.
- Admin queue: hide → review → delete object + row.
- Email contact; log actions; counter-notice stub for later.
- Repeat abuse → quota ban.

---

## 6. Implementation order (revised)

### Quality first (tickets 8–10 — **done**)
8. **ffmpeg post-FX** — optional `POSTPROCESS=1`; loudnorm + peak limit — **done**  
9. **Prompt template pack** — JSON templates; Create UI dropdown — **done**  
10. **Eval harness v0** — fixed 20 prompts; CSV compare of two configs — **done**  
See QUALITY.md.


### Provider choices (before hosted coding)
Pick and lock:
- **Auth:** Auth.js (flexible) *or* Clerk (faster closed beta)  
- **Postgres:** Neon or Supabase  
- **Object storage:** Cloudflare R2 (low egress) or S3  
- **Queue:** Upstash Redis + BullMQ *or* Postgres `FOR UPDATE SKIP LOCKED` (fewer vendors)  

Recommended default (not locked): **Auth.js + Neon + R2 + Postgres SKIP LOCKED** — confirm before hosted milestone.

### Hosted beta milestone (ship as one cohesive unit — not piecemeal public)
1. `APP_MODE=local|hosted` dual-mode flags  
2. Postgres schema + `user_id` + **`compute_provider`** column  
3. Auth middleware + ownership checks  
4. S3/R2 storage adapter + signed URLs  
5. Queue + **pull-based** GPU worker (3080 pulls; never inbound-expose WSL)  
6. Idempotency-Key + free-tier quotas + **one-job concurrency** on invite worker  
7. Progress API (poll/SSE) for web + mobile  

Invite testers on `compute_provider=local` or a dedicated invite worker with strict concurrency. Add **`managed`** rented GPUs only after real usage/cost data. **`byo_worker`** later.

### Near-term recommendation
Tickets **8–10 done**. Parallel: decide providers. Then build **1–7 as one hosted-beta milestone** behind auth/invites.

## 7. Local-only vs hosted

| Stay local-only (dev / power users) | Requires hosted backend / GPU |
|---|---|
| `next dev` + WSL ACE-Step on 3080 | Multi-user auth & billing |
| SQLite + `data/audio` | Postgres + object storage |
| Tauri wrapping local Next | Capacitor / iOS / Android apps |
| Single-flight one GPU | Worker pool, queue, autoscale |
| Personal LoRA experiments | Shared LoRAs with provenance + model cards |
| Mock mode | Public URL, CDN signed downloads |
| PWA against localhost | PWA against production HTTPS |

**Bridge pattern:** Hosted API enqueues; invite-era pull worker may be Dave's 3080 (private, 1 concurrent). Public/`managed` uses rented GPUs. `byo_worker` lets advanced users attach their own pull worker. Never port-forward WSL ACE to the internet.

---

## Near-term recommendation

Tickets **8 → 9 → 10** are done (see QUALITY.md). Choose providers, then ship **hosted beta (1–7)** as one milestone behind invites. Keep product copy ownership-first. Measure quality with the harness, not vibes. Never expose home ACE-Step publicly.
