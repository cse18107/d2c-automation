# Spec: Add Product

**Step:** 01 · **Branch:** feature/add-product · **Status:** draft
**Module:** Product Content
**Plan required before coding:** yes (touches more than 3 files, creates the first tenancy and upload boundary, and introduces the first DB schema and migration)

## 1. Overview
A brand user creates a product by uploading 1..N product photos and one product document (PDF, DOCX, TXT or MD). The app stores the files, parses the document to text, records a `Product` in `draft`, and shows the product in the products list. Submitting starts the `ingest` step of the pipeline as a durable job, and the processing screen shows step progress.

This is the first slice of the pipeline in CLAUDE.md §1:
`ingest → extract_pkr → generate_creatives → generate_listings → policy_check → await_review`.
This feature covers **ingest only**. `extract_pkr` (LLM call to build the PKR) and the PKR review screen belong to Step 02. Nothing in this feature calls an AI model or a platform connector.

Problem solved: a D2C brand gives its product information once (photos + one document), and the rest of the pipeline works from that stored input.

## 2. Scope
- **In scope:**
  - Products list page (`/products`) with status filter tabs and an empty state.
  - New Product wizard, upload step: image dropzone, document dropzone, facts checklist, submit.
  - Server-side validation of MIME type, magic bytes, size and count, for images and the document.
  - EXIF stripping for images (GPS removed).
  - Storage of originals in object storage under `org_id/product_id/`, read through short-TTL signed URLs.
  - Document parsing to plain text for PDF (`unpdf`), DOCX (`mammoth`), TXT and MD (read as UTF-8). Parsing runs in the worker, not in the request handler.
  - Durable `ingest` job with step-level status: `queued → running → succeeded | failed`. Retries only on transient errors.
  - Processing screen (`/products/[productId]/processing`) that polls job status and shows step progress, plus a Cancel action for a queued or running job.
  - Products list and processing screen show each product's current status.
  - Minimal foundation needed for the above: Postgres + Drizzle schema for `Organization`, `Brand`, `Member`, `Product`, `ProductAsset`, `IngestJob`, `AuditEvent`; `src/lib/env.ts`; `src/server/db`, `src/server/storage`, `src/server/jobs`.
- **Out of scope:**
  - PKR extraction, PKR editing, and the PKR workspace (design frame 04). Step 02.
  - Creatives, videos, listings, policy checks, review queue, approval, publishing. Later steps.
  - Real authentication. See Open questions Q1; until it is decided, the feature runs behind a dev-only seeded session.
  - Bulk product import, CSV import, product editing after creation beyond the draft fields below.
  - Any AI call (OpenRouter gateway is not wired by this feature).
  - Billing, quotas, spend caps (the per-product spend cap belongs to the generation steps).

## 3. Users and roles
| Action | owner | approver | editor | viewer |
|---|---|---|---|---|
| View products list and processing screen | yes | yes | yes | yes |
| Create product and upload assets | yes | yes | yes | no |
| Cancel an ingest job | yes | yes | yes | no |
| Delete a draft product | yes | no | no | no |

Delete a draft is in the table because the wizard needs a way to discard a draft. It only deletes a `draft` product that has never been submitted. Deleting a product writes an `AuditEvent`. Open question Q6 asks whether to keep this action in the POC.

## 4. Screens and flows
- **01 Products List** — design node `33178720:340`. Status filter tabs (All, Draft, Processing, Ready for review, Approved, Published, Failed) and a table. Each row shows name, status, image count, document name, and updated date.
- **02 New Product Wizard - Upload** — design node `33178720:470`. Left: images dropzone (`33178720:505`) and document dropzone (`33178720:517`). Right: "What happens next" help panel (`33178720:525`). Primary button "Start processing".
- **03 Processing** — design node `33178720:537`. Pipeline list with step status chips (`33178720:559`), a "You can leave this page" note, and "Cancel job" / "Open PKR when ready" buttons. "Open PKR when ready" is **disabled** in this feature because the PKR screen does not exist yet. See Q4.
- **Empty state** — design frame `14 Empty and Error States` (`33178720:1313`). Use the first frame for "no products yet".

**Flow:**
1. User opens Products list. If the org has no products, the empty state shows "New product".
2. User clicks "New product" and lands on the wizard. A `draft` product is created with a name field (required, 1–120 chars). The name is the only required field.
3. User drops 1..10 images and one document. Each upload goes to a signed upload URL, then the server verifies the file.
4. User ticks the facts checklist (confirms the document is the product's own, and that photos show the real product). "Start processing" is disabled until the checklist is ticked and at least one image and one document are present.
5. Submit sets the product to `processing` and enqueues `ingest`. The user is redirected to the processing screen.
6. The processing screen polls `GET .../ingest-job` every 2 s while the job is `queued` or `running`, and stops when it reaches a terminal state.
7. On success, the product returns to `draft` with `ingestedAt` set (see Q4). On failure, the product is `failed` and the screen shows the normalized error with "Retry ingest" (re-enqueues with a new attempt group) and "Back to draft".

**States (each must render in the UI):**
- Products list: loading (skeleton rows), empty, error (retry button), success.
- Wizard: idle, uploading (per-file progress), upload error (per-file message), ready, submitting.
- Processing: queued, running (per-step), succeeded, failed, cancelled, error loading status.

**Accessibility:** dropzones are keyboard operable (a visible "Choose files" button); file list items have labels; status is announced through `aria-live="polite"`. Contrast meets WCAG AA. Colour is not the only status signal.

**Design fidelity (required for every UI change):** every screen must match its cited frame in `design-assets/Untitled.fig` (Page 1) on layout, sidebar, colour tokens, typography (Inter), spacing, radius (8 px), component shapes and copy. The design is the visual source of truth; code is not allowed to diverge silently.
- Tokens (frame 00): page background `#F9FAFB`; cards white; text `#101828`; secondary text `#344054`; muted text `#667085`; border `#E4E7EC`; primary `#4F46E5`; success `#12B76A` / text `#027A48`; amber `#F79009` (sandbox only); red `#F04438` (live / failed); pending review `#EEF4FF` / `#3538CD`.
- Layout: 232 px left sidebar on every app screen; main content padded 32 px; wizard uses breadcrumb, three-step indicator and a two-column layout with a 352 px "What happens next" panel.
- Copy: use the design's wording. Where a rule in this spec differs from the design's copy (for example photo count or file size), the rule wins and the copy must show the rule's value. Every such difference is listed in the "Approved deviations" table below and needs the user's approval.
- Every state in the design (empty, loading, error, success, processing failed) must be built and screenshot-checked against its frame.
- Verification: each changed screen is captured and compared with the frame's export before the work is called done. Differences are either fixed or added to the deviations table.

**Approved deviations (pending user decision):**

| # | Screen | Design | Implemented | Status |
|---|---|---|---|---|
| D1 | Wizard, photos | "Drop 1–12 photos", "max 15 MB each" | 1–10 photos, 10 MB (spec §8) | pending |
| D2 | Processing | "Open PKR when ready" enabled | disabled until Step 02 (spec Q4) | pending |
| D3 | New product | no name step | name card before the upload step | pending |
| D4 | Wizard side panel | no confirm checkbox | confirm-facts checkbox (spec §4 step 4) | pending |
| D5 | Products list | SKU, creatives, listings, pending approvals | shown as "—" until their steps exist; "Draft" chip added | pending |
| D6 | Processing | pipeline rows `extract_pkr`…`await_review` running; spend line | queued rows; no spend line (no AI calls in Step 01) | pending |
| D7 | Processing failed | "Retry with vision" | "Retry ingest" and "Upload another file" | pending |

## 5. Data model
All tables: `id` (UUIDv7), `org_id`, `created_at`, `updated_at` (UTC ISO 8601 in the API). Monetary fields: none in this feature.

| Table | Zod schema (`src/schemas`) | Key fields |
|---|---|---|
| `organizations` | `OrganizationSchema` | `name`, `pausePublishing boolean default false` (kill switch, Step later; included now so the schema is stable) |
| `brands` | `BrandSchema` | `org_id`, `name`, `slug` |
| `members` | `MemberSchema` | `org_id`, `user_id`, `role` enum `owner\|approver\|editor\|viewer` |
| `products` | `ProductSchema` | `brand_id`, `name`, `status` enum `draft\|processing\|ready_for_review\|approved\|published\|failed`, `ingested_at` nullable, `created_by` |
| `product_assets` | `ProductAssetSchema` | `product_id`, `kind` enum `image\|document`, `storage_key`, `original_filename`, `mime_type`, `size_bytes`, `sha256`, `width`/`height` (images), `exif_stripped boolean`, `parsed_text` (documents, nullable), `sort_order` |
| `ingest_jobs` | `IngestJobSchema` | `product_id`, `attempt_group` (UUIDv7), `status` enum `queued\|running\|succeeded\|failed\|cancelled`, `steps` jsonb (`[{name, status, startedAt, finishedAt, error}]`), `error_code` nullable (ConnectorError-style code), `idempotency_key` unique |
| `audit_events` | `AuditEventSchema` | `actor_id`, `action` (e.g. `product.created`, `product.asset_uploaded`, `ingest.started`, `ingest.failed`), `entity_type`, `entity_id`, `metadata` jsonb (no tokens, no file contents). Append-only: no update or delete path in code; a DB trigger rejects UPDATE/DELETE. |

- Migration: `drizzle-kit generate` → migration name `0001_add_product_ingest`. Schema-only, no data seeding, so the migration is reversible by drop.
- Indexes: `(org_id, status, updated_at)` on `products`; `(product_id)` on `product_assets` and `ingest_jobs`; unique `(idempotency_key)` on `ingest_jobs`.
- `ProductStatus` in `src/schemas` is the single source of truth. The approval-related statuses are defined but not reachable in this feature.

## 6. API and server modules
Route handlers (thin: parse with Zod → call server module → respond). All responses are validated by Zod and errors normalized to `{ error: { code, message } }`.

| Method | Path | Purpose | Input schema | Output schema |
|---|---|---|---|---|
| GET | `/api/products` | list products for the org, filter by status | `ListProductsQuery` (`status?`, `cursor?`, `limit ≤ 50`) | `ProductListResponse` |
| POST | `/api/products` | create draft | `CreateProductInput` (`name`) | `ProductResponse` |
| POST | `/api/products/[productId]/assets` | request signed upload URL | `RequestAssetUploadInput` (`kind`, `filename`, `mimeType`, `sizeBytes`) | `AssetUploadTicket` (`assetId`, `uploadUrl`, `expiresAt`) |
| POST | `/api/products/[productId]/assets/[assetId]/complete` | verify magic bytes and size, strip EXIF, record `sha256` | `{}` | `ProductAssetResponse` |
| DELETE | `/api/products/[productId]/assets/[assetId]` | remove an asset from a draft | — | `204` |
| POST | `/api/products/[productId]/ingest` | submit: validate counts, set `processing`, enqueue `ingest` | `SubmitIngestInput` (`factsConfirmed: true`) | `IngestJobResponse` |
| GET | `/api/products/[productId]/ingest` | current ingest job and step status | — | `IngestJobResponse` |
| POST | `/api/products/[productId]/ingest/cancel` | cancel a queued or running job | — | `IngestJobResponse` |
| DELETE | `/api/products/[productId]` | delete a draft product (see §3) | — | `204` |

- `POST .../assets` returns a short-TTL **upload** URL (5 min). Image bytes do not pass through the Next.js handler.
- Download URLs (for the processing screen thumbnails) are signed with a 5 min TTL and generated per request. They are never stored.
- Route handlers stay thin. Server modules:
  - `src/server/products/index.ts` — create, list, submit, delete, state transitions for `Product.status` in this feature.
  - `src/server/uploads/index.ts` — ticketing, MIME and magic-byte checks, size caps, EXIF stripping (`sharp`), `sha256`.
  - `src/server/ingest/index.ts` — the `ingest` workflow: load assets, parse the document, persist `parsed_text`, update steps.
  - `src/server/storage/index.ts` — S3-compatible client, signed URLs, `putObject`, `getObject` (server-only).
  - `src/server/db/index.ts` — Drizzle client, `withOrg(orgId)` helper that adds the `org_id` predicate (§10).
  - `src/server/jobs/index.ts` — enqueue and handler wrapper (durable runner; see Q3).
  - `src/server/audit/index.ts` — `recordAuditEvent()`; the only write path for `audit_events`.
  - `src/server/products/product-status.ts` — pure status transition map (tested in §14).
- Every module under `src/server/` imports `"server-only"`.
- Long work (`ingest`: parsing, EXIF stripping of many files) runs as a durable job. The handler only enqueues and returns `202`-style `IngestJobResponse`.
- Idempotency: `POST .../ingest` takes an `Idempotency-Key` header. The key is stored in `ingest_jobs.idempotency_key`. A repeat with the same key returns the same job and does not enqueue again.

## 7. Approval and safety impact (CRITICAL)
- **Creates, changes or publishes a `PublishRequest` or `Approval`?** No impact. This feature does not create publish requests or approvals and cannot reach `approved` or `published`. The state transition map (`product-status.ts`) makes those transitions unreachable from this feature's code. A test asserts it.
- **Does editing this content invalidate an existing approval (§7.2)?** No impact, because no approvals exist yet. The asset `sha256` is stored now so Step 03+ can hash the exact payload.
- **Touches spend or budgets (§7.5)?** No impact. No AI or paid API calls are made.
- **Touches the live gate or kill switch (§7.6, §7.9)?** No impact on the gate. The `organizations.pausePublishing` column is added so the schema is stable, but this feature does not read or write it.
- **Writes audit events (§7.8)?** Yes. `product.created`, `product.asset_uploaded`, `product.asset_removed`, `ingest.started`, `ingest.succeeded`, `ingest.failed`, `ingest.cancelled`, `product.deleted`. Metadata never includes file contents or signed URLs.
- **Touches AI generation or connectors (§8, §6)?** No. No connector is created. No AI gateway import.

## 8. Content policy and AI rules
- **Policy checks:** none in this feature. Policy checks (prohibited claims, trademarks, medical claims) run at the `policy_check` step, which is out of scope. This feature only checks the upload rules below.
- **AI calls:** none in this feature. No prompt file is created. The PKR extraction prompt (`src/server/ai/prompts/pkr-extract.v1.md`) is Step 02.
- **PKR as the only source of claims:** not applicable in this step. The parsed text is stored as-is in `product_assets.parsed_text` and is never shown as a claim. Step 02 is responsible for extracting facts from it.
- **Document content is untrusted:** the parsed text is data only. The ingest code never interprets it as instructions and never uses it to choose a tool, a connector or a publishing action.

**Upload rules (enforced server-side; the client check is a convenience only):**

| Kind | Allowed MIME | Magic bytes | Max size | Max count |
|---|---|---|---|---|
| image | `image/jpeg`, `image/png`, `image/webp` | JPEG `FF D8 FF`; PNG `89 50 4E 47 0D 0A 1A 0A`; WebP `RIFF....WEBP` | 10 MB | 10 |
| document | `application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `text/plain`, `text/markdown` | PDF `%PDF-`; DOCX `PK 03 04` (ZIP) plus a `word/document.xml` entry; TXT/MD: valid UTF-8, no NUL bytes | 10 MB | 1 |

- Images must be at least 600 px on the shortest side (listing main images need it later). Smaller images are rejected with `VALIDATION`.
- A file whose extension and MIME type disagree with its magic bytes is rejected.
- Document page cap: 50 pages for PDF. Above that, reject with `VALIDATION`.
- Filenames are sanitized for display and never used in storage keys (storage key is `org_id/product_id/assetId.<ext>`).

## 9. Connectors
- **Platform and kind:** None.
- **Sandbox behaviour:** not applicable.
- **Mock file:** not applicable.
- **ConnectorError codes:** not applicable.
- Storage is not a connector. It lives in `src/server/storage` and is not part of the publishing layer.

## 10. Security and tenancy
- **Every query is scoped by `org_id`.** All reads and writes use `withOrg(orgId)`. A repository function without `org_id` in its signature is a review blocker. Postgres RLS is considered for Step 02 (see Q2).
- **Cross-tenant test:** a request for another org's `productId` returns `404 NOT_FOUND` (not `403`, so existence is not leaked). Required test, §14.
- **Uploads:** MIME allowlist, magic-byte check, size cap, count cap (§8). EXIF GPS stripped with `sharp` (`.rotate()` then re-encode without metadata for JPEG/WebP/PNG). Upload and download URLs are signed with 5 min TTL.
- **Document parsing sandbox:** `unpdf`, `mammoth` and text decoding run inside the ingest job, which has a timeout (60 s per document) and a memory cap in the worker. Parsing errors map to `VALIDATION` (bad file) or `PERMANENT` (parser crash). Parser errors must not leak stack traces to the client.
- **Untrusted document content:** parsed text is stored only. It does not affect control flow, tool choice or publishing.
- **No secrets logged or sent to the client:** signed URLs and storage keys are not logged. `DATABASE_URL` and storage credentials are server-only and validated in `src/lib/env.ts`. `NEXT_PUBLIC_` prefix is not used for any of them.
- **CSRF:** all mutations are POST/DELETE route handlers; CSRF protection is required before auth ships (CLAUDE.md §11). Blocked on Q1.
- **CSP and CORS:** unchanged in this feature; the CSP header must be added with the auth work (Q1).
- **Rate limits:** `POST /api/products/*/assets` and `POST .../ingest` are rate-limited per user and per org. Limiter implementation is listed in §13 as open.
- **Logs:** structured JSON via pino, no `console.log`. Log fields: `orgId`, `productId`, `jobId`, `step`, `status`, `errorCode`.

## 11. Files to change
- `src/app/layout.tsx` — add a sidebar/nav shell with links to Products.
- `src/app/page.tsx` — "New product" button links to `/products/new`; the pipeline list stays.
- `src/app/globals.css` — only if a new token is required by the design (no new tokens expected).
- `src/lib/env.ts` — new: Zod-validated env (`DATABASE_URL`, `STORAGE_*`, `DEV_SESSION_ORG_ID`).
- `.env.example` — add keys with no values (`DATABASE_URL`, `STORAGE_ENDPOINT`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`, `DEV_SESSION_ORG_ID`).
- `package.json` — new dependencies (§13); `package-lock.json` regenerated.
- `biome.json` — no change expected unless Biome rejects the new layout.
- `README.md` — short section on running the Postgres and storage services locally.
- `CLAUDE.md` §15 — add `db:generate` and `db:migrate` to the commands list once they are wired (CLAUDE.md §15 says to update the list with the feature).

## 12. Files to create
Keep every file under ~300 lines.

**Schemas (`src/schemas`)**
- `src/schemas/index.ts` — public re-exports.
- `src/schemas/product.ts` — `ProductStatusSchema`, `ProductSchema`, `CreateProductInputSchema`, `ListProductsQuerySchema`, `ProductListResponseSchema`.
- `src/schemas/product-asset.ts` — `AssetKindSchema`, `RequestAssetUploadInputSchema`, `AssetUploadTicketSchema`, `ProductAssetSchema`.
- `src/schemas/ingest.ts` — `IngestStepSchema`, `IngestJobSchema`, `SubmitIngestInputSchema`, `IngestJobResponseSchema`.
- `src/schemas/errors.ts` — `ApiErrorSchema` (`code` enum `VALIDATION | NOT_FOUND | CONFLICT | RATE_LIMITED | TRANSIENT | PERMANENT`).
- `src/schemas/audit.ts` — `AuditEventSchema`.

**Database (`src/server/db`)**
- `src/server/db/index.ts` — Drizzle client (server-only).
- `src/server/db/schema/organizations.ts`, `brands.ts`, `members.ts`, `products.ts`, `product-assets.ts`, `ingest-jobs.ts`, `audit-events.ts` — Drizzle tables. Each under 80 lines.
- `src/server/db/with-org.ts` — `withOrg(orgId)` helper.
- `drizzle.config.ts` — drizzle-kit config reading `DATABASE_URL` through `src/lib/env.ts`.
- `drizzle/0001_add_product_ingest.sql` — generated by `drizzle-kit generate`, not hand-written.
- `drizzle/0002_audit_append_only.sql` — generated trigger migration rejecting UPDATE/DELETE on `audit_events` (hand-authored SQL added via `drizzle-kit generate --custom`).

**Storage (`src/server/storage`)**
- `src/server/storage/index.ts` — public exports.
- `src/server/storage/client.ts` — S3 client from env.
- `src/server/storage/signed-urls.ts` — upload and download signed URL helpers (5 min TTL).
- `src/server/storage/keys.ts` — `buildAssetKey(orgId, productId, assetId, ext)`; pure, tested.

**Uploads (`src/server/uploads`)**
- `src/server/uploads/index.ts` — public exports.
- `src/server/uploads/rules.ts` — MIME, size, count, dimension rules (pure constants and functions).
- `src/server/uploads/magic-bytes.ts` — pure magic-byte checks for each allowed type.
- `src/server/uploads/strip-exif.ts` — `sharp`-based EXIF/GPS removal and dimension read.
- `src/server/uploads/verify-asset.ts` — orchestrates: fetch object, check magic bytes, strip EXIF (images), hash, persist.

**Ingest (`src/server/ingest`)**
- `src/server/ingest/index.ts` — public exports.
- `src/server/ingest/workflow.ts` — `ingest` steps: `load_assets`, `parse_document`, `finalize`. Each step idempotent and writes its output to the DB.
- `src/server/ingest/parse-document.ts` — dispatches to PDF / DOCX / text parsers with a 60 s timeout.
- `src/server/ingest/parsers/pdf.ts`, `docx.ts`, `text.ts` — one parser each.
- `src/server/ingest/status.ts` — pure job status and step transitions.

**Products (`src/server/products`)**
- `src/server/products/index.ts` — public exports.
- `src/server/products/product-status.ts` — pure transition map for `Product.status`; illegal transitions throw `ApprovalError`-family typed error (`ValidationError` in this feature).
- `src/server/products/service.ts` — create, list, submit, cancel, delete draft.
- `src/server/products/errors.ts` — typed errors (`ValidationError`, `NotFoundError`, `ConflictError`).

**Jobs (`src/server/jobs`)**
- `src/server/jobs/index.ts` — `enqueue` and `registerHandler` wrappers around the chosen runner (Q3).
- `src/server/jobs/ingest-handler.ts` — binds `ingest` workflow to the runner.

**Audit (`src/server/audit`)**
- `src/server/audit/index.ts` — `recordAuditEvent()`. No update or delete exports.

**Logger (`src/lib/logger.ts`)**
- pino instance with redaction for `authorization`, `cookie`, `url` on signed URLs, `storageKey`.

**Auth shim (`src/server/session`)**
- `src/server/session/index.ts` — `getSession()` returning `{ orgId, userId, role }`. In dev, reads `DEV_SESSION_ORG_ID`; in production, throws until real auth lands (Q1). Server-only.

**Route handlers (`src/app/api/products`)**
- `src/app/api/products/route.ts` — GET, POST.
- `src/app/api/products/[productId]/route.ts` — DELETE.
- `src/app/api/products/[productId]/assets/route.ts` — POST (upload ticket).
- `src/app/api/products/[productId]/assets/[assetId]/route.ts` — DELETE.
- `src/app/api/products/[productId]/assets/[assetId]/complete/route.ts` — POST.
- `src/app/api/products/[productId]/ingest/route.ts` — GET, POST.
- `src/app/api/products/[productId]/ingest/cancel/route.ts` — POST.

**Pages (`src/app/(app)`)**
- `src/app/(app)/layout.tsx` — Server Component shell with nav.
- `src/app/(app)/products/page.tsx` — Server Component; loads the list, renders the table or empty state.
- `src/app/(app)/products/new/page.tsx` — Server Component wrapper for the wizard.
- `src/app/(app)/products/[productId]/processing/page.tsx` — Server Component; renders the processing screen shell.
- `src/app/(app)/products/loading.tsx`, `error.tsx`, `not-found.tsx` — required states.

**Client components (`src/components/products`, `"use client"` only where interactive)**
- `src/components/products/product-table.tsx` — presentational (Server Component). Status filter tabs are a small client component.
- `src/components/products/status-filter.tsx` — client; updates the URL query string.
- `src/components/products/new-product-wizard.tsx` — client; name field, dropzones, facts checklist, submit.
- `src/components/products/asset-dropzone.tsx` — client; drag and drop plus a keyboard-operable file input.
- `src/components/products/asset-list.tsx` — presentational list of selected files with per-file status and remove button.
- `src/components/products/upload-client.ts` — client helper: request ticket, `PUT` to signed URL with progress, call `complete`.
- `src/components/products/processing-status.tsx` — client; polls `GET .../ingest` every 2 s and stops on terminal states.
- `src/components/products/status-badge.tsx` — presentational; text plus colour for each `ProductStatus`.
- `src/components/products/empty-products.tsx` — presentational empty state.

**shadcn/ui (`src/components/ui`)** — add with `npx shadcn@latest add <name>`, not hand-rolled:
- `table`, `tabs`, `input`, `label`, `checkbox`, `progress`, `alert`, `skeleton`, `dialog`, `alert-dialog`, `badge` (exists), `button` (exists), `card` (exists), `toast` / `sonner` (decide with Q5).

**Tests**
- `src/server/products/product-status.test.ts`
- `src/server/uploads/magic-bytes.test.ts`
- `src/server/uploads/rules.test.ts`
- `src/server/storage/keys.test.ts`
- `src/server/ingest/status.test.ts`
- `src/server/ingest/workflow.test.ts` (integration, test DB + storage mock)
- `src/server/products/cross-tenant.test.ts` (integration; the required regression test)
- `src/server/audit/append-only.test.ts` (integration; UPDATE and DELETE rejected)
- `src/schemas/product.test.ts`
- `src/app/api/products/products-api.test.ts` (route tests for validation and error normalization)
- `src/test/fixtures/` — small valid and invalid files: a JPEG with GPS EXIF, a PNG, a WebP, a PDF, a DOCX, a TXT, an MD, a file with a wrong extension, an oversized file (generated in test, not committed).
- `vitest.config.ts` — added when Vitest is wired (CLAUDE.md §15 lists `npm test` as "not wired yet"; this feature wires it).
- `playwright.config.ts` and `e2e/add-product.spec.ts` — the E2E flow is part of Step 01 only up to the processing screen. Required by §14 but the full flow (review, approve, publish) is later.

**Documentation**
- `docs/adr/0002-product-ingest-storage-and-jobs.md` — ADR for the choice of Postgres + Drizzle, the object-storage provider, and the durable job runner (Q2 and Q3 need the ADR before the choice is final). Required by CLAUDE.md §16.7.

## 13. New dependencies
None are installed yet. The following are **proposed**. CLAUDE.md §16.5 requires your approval before adding them. Versions were **not** verified against current docs in this drafting step; they must be checked and pinned at implementation time (CLAUDE.md §3, §16.4).

| Name | Purpose | Major dependency? | Status |
|---|---|---|---|
| `drizzle-orm`, `drizzle-kit`, `postgres` (or `@neondatabase/serverless`) | DB access and migrations | yes | needs approval (Q2) |
| `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` | S3-compatible storage and signed URLs (Cloudflare R2 works with this client) | yes | needs approval (Q2) |
| `unpdf` | PDF text extraction | no | proposed |
| `mammoth` | DOCX text extraction | no | proposed |
| `sharp` | image metadata and EXIF stripping | yes (native binary) | needs approval |
| Durable job runner: `inngest` or `@trigger.dev/sdk` | durable steps and retries | yes | needs approval (Q3) |
| `pino` | structured logs | no | proposed |
| `vitest`, `@vitest/coverage-v8`, `msw` | unit, integration and connector mocking | no | proposed (dev only) |
| `@playwright/test` | E2E | no | proposed (dev only) |
| `react-hook-form`, `@tanstack/react-query` | forms and polling | no | proposed; the wizard may use plain React state instead (Q5) |

Auth is not added in this feature (Q1).

## 14. Tests
- **Unit:**
  - Schemas: `ProductSchema` rejects an unknown status; `CreateProductInputSchema` enforces name 1–120 chars.
  - Product status transitions: every legal transition in this feature passes; every illegal transition throws, including `draft → approved`, `draft → published`, `processing → published`, `failed → approved`, and any transition into `approved` or `published` from this feature's code path.
  - Upload rules: each allowed type accepted; each disallowed type rejected; wrong extension vs magic bytes rejected; size at exactly 10 MB accepted, 10 MB + 1 rejected; 11th image rejected; second document rejected; image under 600 px rejected.
  - Magic bytes: JPEG, PNG, WebP, PDF, DOCX (ZIP with `word/document.xml`), TXT (UTF-8), MD; NUL byte in TXT rejected.
  - Storage keys: `buildAssetKey` never includes the original filename; rejects non-UUIDv7 IDs.
  - Ingest status: step transition map; retry only for `TRANSIENT`.
  - Content hash: the `sha256` of an asset changes when bytes change, and is stable for the same bytes.
- **Integration (test DB, mocked storage and parser boundary where needed):**
  - Ingest workflow: happy path for each document type; a parser timeout produces `PERMANENT` on the step and `failed` on the job; re-running a step does not duplicate `product_assets.parsed_text`.
  - Idempotency: two `POST .../ingest` calls with the same `Idempotency-Key` enqueue one job.
  - Cancel: cancelling a queued job moves it to `cancelled` and skips later steps.
  - Audit: each action in §7 writes exactly one `AuditEvent`.
- **Required regression tests (this feature touches tenancy and uploads):**
  - "cross-tenant access denied": org B reads, updates, uploads to, submits and deletes org A's product. All return `404`. Test is required and must fail if `withOrg` is bypassed.
  - "cannot publish without approval": not applicable in this feature. The state-transition test in the unit list covers the reachable-state guarantee. Recorded here so the gap is explicit.
  - "editing after approval invalidates it": not applicable (no approvals yet).
  - "kill switch blocks publishing": not applicable (no publishing yet).
- **Route tests:** each route returns a Zod-valid body on success and a normalized `{ error: { code, message } }` for each error code.
- **E2E (Playwright, mocked storage):** create a product → upload 2 images and 1 PDF → submit → processing screen shows `succeeded` → product appears in the list as `draft` with `ingestedAt` set. Error path: upload a file with a wrong magic byte → inline error on that file, product remains creatable.
- **Connector contract tests:** not applicable.
- **No real AI or platform API calls in CI.** Storage uses a local S3-compatible mock (MinIO or an in-memory fake); the test DB is a disposable Postgres.

## 15. Rules for implementation
- Follow CLAUDE.md §13: strict TypeScript, `noUncheckedIndexedAccess`, no `any`, no `console.log`, typed errors, UTC ISO dates, UUIDv7 IDs.
- Use shadcn/ui components from `src/components/ui`. Do not hand-roll tables, dialogs, buttons, inputs, tabs or cards.
- Server Components by default. `"use client"` only for the wizard, dropzone, status filter and processing poller.
- No publish actions exist in this feature. If one is added, it must follow the confirm-dialog rule (platform, account, item, mode; button "Approve & publish to <Platform>").
- No optimistic updates on approval actions (not applicable here, recorded for later steps).
- Use npm only. Commit `package-lock.json`.
- Migrations only via `drizzle-kit generate`. Never edit an applied migration.
- Comments explain why, not what. Link the ADR for storage and job-runner choices.
- Keep every file under ~300 lines.
- Design fidelity: every UI change matches its cited design frame (see §4 "Design fidelity"). Capture the screen, compare it with the frame's export, and fix any difference or add it to the deviations table before reporting the work done.
- Do not add or change a screen, colour, font, spacing or copy string without checking it against the design first. If the design and the spec conflict, ask the user; do not pick silently.
- Sidebar, tokens and typography come from `src/app/globals.css` and `src/app/layout.tsx`. Components must not hard-code colours that differ from the design tokens.

## 16. Open questions
These need your decision. The spec does not guess them.

- **Q1 — Authentication (blocking for production, not for dev).** CLAUDE.md §3 offers Better Auth or Clerk. Recommendation: **Clerk** for the fastest org and role support; Better Auth if you want everything in your own DB. Until decided, this feature runs with a dev-only session from `DEV_SESSION_ORG_ID`, and the app refuses to start in production without auth. Which one?
- **Q2 — Database and object storage providers.** CLAUDE.md §3 offers Neon or Supabase for Postgres, and R2 or S3 for storage. Recommendation: **Neon** and **Cloudflare R2**. This also needs an ADR (`docs/adr/0002-...`) and approval of the dependencies in §13.
- **Q3 — Durable job runner.** Inngest or Trigger.dev, with BullMQ + Redis as the fallback. Recommendation: **Inngest** (step functions map directly to `ingest` steps; runs in the Next.js deployment). Requires an ADR. Which one?
- **Q4 — End state of a successful ingest before PKR exists.** Options: (a) product returns to `draft` with `ingestedAt` set (recommended; no status lies about PKR existing); (b) product stays `processing` until Step 02 completes the pipeline. The processing screen's "Open PKR when ready" button is disabled in this feature under (a). Which do you want?
- **Q5 — Toasts and forms.** Use shadcn `sonner` for toasts, and plain React state or React Hook Form + Zod for the wizard? Recommendation: React Hook Form + Zod, because CLAUDE.md §3 names it for forms.
- **Q6 — Delete draft in POC.** The wizard needs a way to discard a draft. Keep the `DELETE /api/products/[productId]` action (recommended, audited, drafts only) or defer it?
- **Q7 — Upload limits.** The values in §8 (10 images, 10 MB each, 1 document, 10 MB, 50 PDF pages, 600 px minimum) are my proposal, not from the planning doc. Confirm or change them.
- **Q8 — Design deviations.** Frame `02` has a help-panel text overflow and several off-grid gaps (12, 14, 20) reported by the design linter. I plan to implement to the 8px grid and to wrap text inside the panel. Acceptable, or should the design be fixed first?
- **Q9 — Rate limiter.** Upstash Redis, Postgres-backed counters, or the job runner's concurrency controls? Needed for CLAUDE.md §11. Recommendation: Postgres-backed counters for the POC, to avoid another service.

## 17. Definition of done
- [ ] `npm run lint` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run build` passes
- [ ] Tests for this feature pass (`npm test`, once Vitest is wired in this feature)
- [ ] E2E test for upload → submit → processing → list passes against mocked storage (`npm run test:e2e`, once Playwright is wired)
- [ ] Each screen in §4 renders with its loading, empty, error and success states (Products list, wizard, processing)
- [ ] Cross-tenant regression test passes (§14)
- [ ] Product status transition test proves no path from this feature reaches `approved` or `published` (§7)
- [ ] Upload rule tests pass, including EXIF GPS removal on a fixture JPEG
- [ ] Audit events written once per action in §7; `audit_events` rejects UPDATE and DELETE
- [ ] No secrets or `console.log` in the diff; `pino` redaction covers signed URLs and storage keys
- [ ] `.env.example` lists every new key with no value; `README.md` updated for local Postgres and storage
- [ ] `docs/adr/0002-product-ingest-storage-and-jobs.md` written and linked from this spec
- [ ] CLAUDE.md §15 command list updated for `db:generate` and `db:migrate` once wired
- [ ] Each changed screen matches its design frame (screenshot compared); every difference is fixed or listed in the deviations table

## Plan (implementation waits for your go-ahead)
Order of work, one vertical slice at a time (CLAUDE.md §16.2). Each slice ends with lint, typecheck and build passing.

1. **Decisions:** answer Q1–Q3 (auth, DB/storage, job runner) and approve the §13 dependencies. Write `docs/adr/0002-…`.
2. **Foundation:** env validation (`src/lib/env.ts`), Drizzle schema and migration `0001`, append-only audit migration `0002`, `withOrg`, logger, dev session shim.
3. **Uploads:** rules, magic bytes, EXIF stripping, signed upload URLs, `complete` route. Unit tests for every rule.
4. **Products API + list:** create, list, delete-draft routes; status transition map with illegal-transition tests; products list page with empty and error states; cross-tenant test.
5. **Wizard:** upload UI, facts checklist, submit route with idempotency key.
6. **Ingest workflow:** durable job, parsers, step status, cancel, retry; processing screen with polling.
7. **Hardening:** rate limits, E2E test, README and `.env.example`.

Touches the upload and tenancy boundaries (security code, CLAUDE.md §16.5). Stop and confirm with you before step 2 writes any schema.
