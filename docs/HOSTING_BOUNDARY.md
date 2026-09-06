# Hosting boundary (pre-hosting docs only)

Audio Alchemy today is a **single-user local product**. This document lists what must change **only when** the project is deliberately ready for multi-user hosted servers. It is planning guidance — **no hosted implementation is in this tree**.

## Hard local boundary (current)

- Generations run on the owner's configured local engine (or explicit mock).
- A local development GPU must **never** become a public render server.
- No auth, billing, multi-tenant queues, or remote user access in the local MVP.
- Persistence stays under local `./data` (SQLite + audio). Optional `DATA_DIR`.

## What changes only when ready for servers

### Identity and access

- Authentication and accounts (session / OAuth / API keys per user).
- Authorization boundaries between users' libraries and jobs.
- Abuse controls (rate limits, CAPTCHA/challenge, ban/suspend paths).

### Data plane

- Postgres (or equivalent) instead of single-node SQLite for multi-writer metadata.
- Object storage for audio artifacts (S3-compatible or similar) with signed URLs.
- Backup, point-in-time recovery, and user-initiated deletion / export flows that meet hosted retention policy.
- Audit log of admin and destructive actions.

### Compute and jobs

- Job queue + workers separate from the web tier.
- Quotas (jobs/day, minutes/day, concurrent jobs) and compute tiers.
- Explicit compute provider selection: platform-hosted GPUs and/or authenticated user-owned endpoints — **never** route public work to a local development worker.
- Honest capability advertising: requested model ≠ actual until the worker confirms.

### Observability and operations

- Metrics, tracing, structured logs (no secrets).
- Runbooks for worker outage, queue backlog, storage failure, and model inventory drift.
- Status page / degraded-mode messaging that does not claim mock or offline engines as "online ACE".

### Product policy

- Terms, privacy, ownership language remain **product policy**, not legal advice.
- No Suno branding. Upstream model licenses still apply to checkpoints users run.

## Intentionally out of scope until a hosting decision

- Cloud auth / billing / multi-tenant queues in this repo.
- LoRA training pipelines and public reference-audio ingestion.
- Turning any single developer's workstation GPU into a shared render farm.

See also: `COMPUTE_PROVIDER_MODEL.md`, `QUALITY_GATES.md`, `LOCAL_PRODUCT_POLISH.md`.
