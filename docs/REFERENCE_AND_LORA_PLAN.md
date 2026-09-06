# Reference audio and tiny LoRA - plan only

**Status:** Planning document only. No ingest UI, adaptation pipeline, or LoRA code in this pass.
**Product stance:** Ownership-first policy. Not legal advice.

Related: QUALITY_PLAN.md, datasets/PROVENANCE.csv, datasets/REJECTS.md, RUBRIC.md.

---

## Goals (later)

1. Allow rights-gated reference audio the user owns or has explicit permission to use.
2. Keep provenance for any material that might later inform a tiny LoRA or style pack.
3. Reject scraped / third-party dumps and artist-imitation datasets.
4. Optionally adapt a tiny LoRA on an allow-listed local corpus only after attestation and provenance are product-ready.

This document is intentionally non-implementing. Hosted multi-user work remains deferred (see QUALITY_PLAN.md).

---

## 1. Rights-gated reference audio

Before any reference clip is stored or used for conditioning / adaptation:

| Requirement | Notes |
| --- | --- |
| Ownership or permission attestation | User confirms they own the recording or hold written permission for private model adaptation |
| Source type | Self-recorded, commissioned, licensed sample pack with adaptation rights, etc. |
| No silent scrape | No browser extensions, stream rippers, or import-from-URL that bypasses rights |
| Retention | Local-first; clear delete path; no silent cloud adaptation |

Attestation is a product policy gate, not a legal determination.

Suggested attestation fields (future UI - do not build now): attested_by, attested_at, rights_basis (owned|licensed|permission_letter|other), notes.

---

## 2. Provenance for training material

Extend datasets/PROVENANCE.csv (headers already stubbed):

asset_id,title,source_url,license,license_url,retrieved_at,sha256,curator,allowed_uses,notes

Rules:

- Every reference or adaptation asset must have a provenance row before use.
- allowed_uses must explicitly include adaptation if a LoRA will touch it.
- Prefer content you recorded or commissioned; commercial sample packs only when the license allows derivative ML use.
- Hash (sha256) binds the file bytes to the row.

---

## 3. Explicit rejects

Do not accept or plan pipelines for:

| Reject | Why |
| --- | --- |
| Stream or site rips | No rights chain; often ToS plus copyright issues |
| Commercial tracks from DSPs | No redistribution or adaptation rights by default |
| Artist-style datasets | Product forbids artist imitation packs |
| Audio RAG over third-party catalogs | Retrieval of unlicensed commercial audio |
| Platform dumps or leaked checkpoints | Third-party dumps are out of scope |
| Scraped multi-artist corpora | Same rights and imitation concerns |

See also datasets/REJECTS.md.

Prompt packs (e.g. metal Fine-tune templates) stay text-only: production language and arrangement structure - no artist names, no in-the-style-of phrasing.

---

## 4. Later work (documentation only)

Tiny LoRA remains future work after provenance gates exist. No product code in this pass.
- Scope stays single-user and local.
- Inputs must be provenanced and allow-listed.
- Use the existing compare eval before changing Quality defaults.
- Non-goals include marketplace and multi-tenant hosting.

---

## 5. Relationship to this product pass

This pass is UI/product only: Create flow, truthful Turbo/SFT status, metal prompt packs, A/B eval CSV/sheet.
Hosted server / auth / cloud architecture remain deferred. Reference ingest and LoRA remain planned only here.
