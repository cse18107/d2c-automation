# CLAUDE.md — D2C Autopilot

Source of truth for how Claude Code works in this repo. Read it fully before changing code. If a rule here conflicts with a request, flag the conflict instead of silently picking one.

## 1. Product

**Working name:** `d2c-autopilot`. Automates marketing and marketplace listing for D2C brands.

**Input per product:** 1..N raw product images, plus one product document (PDF / DOCX / TXT / MD) with description, specs, USPs, materials, pricing, dimensions and certifications.

**Pipeline:**
1. Parse the document and images into a **Product Knowledge Record (PKR)**.
2. Generate 5–6 ad creatives (images), 2–3 short real-life-use-case videos (6–15 s), and ad copy (headlines, primary text, CTAs, hashtags).
3. Generate marketplace listing assets (main image, gallery, title, bullets, description, keywords, attributes) adapted to each platform's rules.
4. Route everything through review and approval.

**Outputs (only after explicit approval):**
- Ads: Meta, Instagram, Pinterest, YouTube, Google Ads
- Marketplaces: Amazon, Flipkart, Meesho, Walmart, Etsy
- Stores: Shopify, WooCommerce, Dukaan

> **The #1 invariant:** nothing is published, listed, or spent against a real account without a recorded, per-platform, per-item human approval. See §7.

## 2. Scope

- **In scope (POC):** multi-brand org, a few users; upload → generate → review → approve → publish. Two ad platforms and two listing targets live (suggested: Meta + Pinterest, Shopify + Etsy); the rest are adapters in dry-run / sandbox mode. Audit log, approval gate, job status UI.
- **Out of scope:** billing, multi-region, fine-tuned or custom image models, autonomous budget optimization or bidding, mobile app.
- Do **not** add features outside this scope without asking.

## 3. Tech Stack

Always use the latest **stable** release of each tool. Before adding or upgrading a dependency, check its current docs. Do not rely on memory for AI SDKs or marketplace APIs.

**Installed:** Next.js 16 (App Router, Turbopack), React 19, TypeScript 7 (strict), Tailwind CSS v4, shadcn/ui (`radix-vega` preset, Radix primitives), Lucide icons, Zod 4, Biome 2.

| Layer | Choice (add when a feature needs it) |
|---|---|
| Forms / data | React Hook Form + Zod (shared schemas); TanStack Query for client state |
| Database | PostgreSQL (Neon or Supabase) + Drizzle ORM + drizzle-kit migrations |
| Queue / workflows | Inngest or Trigger.dev (durable steps, retries); BullMQ + Redis as fallback |
| Object storage | S3-compatible (Cloudflare R2 or S3), signed URLs only |
| Auth | Better Auth or Clerk (orgs and roles) |
| Third-party tokens | Encrypted at rest (envelope encryption, KMS) |
| AI gateway | OpenRouter (single key, OpenAI-compatible) for all text, image and video models |
| Doc parsing / images / video | `unpdf` / `mammoth` (Claude vision for scanned PDFs); `sharp`; `ffmpeg` |
| Observability | OpenTelemetry + Sentry; structured JSON logs (pino) |

## 4. Repository Layout

Single Next.js app for now. Split into `packages/*` (npm workspaces + Turborepo) only when the worker and shared packages are needed, and record that in an ADR first.

```
.
├── src/
│   ├── app/              # App Router: pages, layouts, globals.css
│   │   └── api/          # Backend: route handlers (Zod-validated)
│   ├── components/ui/    # shadcn/ui components (generated; edit deliberately)
│   └── lib/              # utils, env validation, shared helpers
│   # Planned: src/server/ (db, ai, connectors, approvals), src/schemas/, worker/
├── docs/adr/             # Architecture decision records (NNNN-title.md)
├── components.json       # shadcn/ui config
├── biome.json
├── next.config.ts
└── CLAUDE.md
```

Rules:
- Server-only modules (DB, secrets, AI, connectors) import `"server-only"`.
- Connectors never import the AI gateway. Connectors publish; they do not generate.
- Modules expose a public `index.ts`. No deep imports across module boundaries.

## 5. Core Domain Model

Define in Zod (`src/schemas`) and mirror in Drizzle.

- **Organization / Brand / Member:** tenancy; roles `owner`, `approver`, `editor`, `viewer`.
- **Product:** status `draft | processing | ready_for_review | approved | published | failed`; **ProductAsset** (images, documents).
- **PKR:** versioned JSON (name, features, specs, materials, price, claims, audience, tone).
- **Creative:** `kind: image | video`, copy, aspect ratio, duration, platform targets, version, `promptHash`, `modelId`.
- **ModelSetting:** per org (optional per-brand override) `textModelId`, `imageModelId`, `videoModelId`, spend caps.
- **Listing:** platform title, bullets, description, attributes, images, price, SKU.
- **Connection:** platform, scopes, encrypted tokens, `mode: sandbox | live`.
- **PublishRequest** (unit of approval), **Approval** (content hash), **PublishJob** (idempotency key, status, `externalId`), **AuditEvent** (append-only).

Every table has `id` (UUIDv7), `created_at`, `updated_at`, `org_id`.

## 6. Platform Connectors

All platforms sit behind one interface (`src/server/connectors/core`, created with the first connector):

```ts
interface PlatformConnector<TPayload, TResult> {
  readonly platform: PlatformId;
  readonly kind: "ad" | "marketplace" | "store";
  validate(payload: TPayload): ValidationReport;             // pure, no network
  preview(payload: TPayload): Promise<PreviewArtifact>;      // dry-run render
  publish(ctx: PublishContext, payload: TPayload): Promise<TResult>; // side effect
  getStatus(ctx: PublishContext, externalId: string): Promise<RemoteStatus>;
}
```

- `publish()` is called only by the publish worker, and only for a `PublishRequest` with a valid approval (§7).
- Every connector supports `sandbox | live`. **Default is sandbox.** Live needs an explicit per-Connection toggle by an `owner`.
- Every connector ships a mock (`*.mock.ts`) for tests and demos.
- Errors normalize to `ConnectorError`: `AUTH_EXPIRED | RATE_LIMITED | VALIDATION | POLICY_REJECTED | TRANSIENT | PERMANENT`. Only `RATE_LIMITED` and `TRANSIENT` are retried.
- Rate limits go through the shared limiter. Never hand-roll sleeps.

**Platform reference (verify current official docs before coding):**

| Platform | API | Notes |
|---|---|---|
| Meta / Instagram | Marketing API + Instagram Graph API | App review and business account. Ads created PAUSED. |
| Pinterest | API v5 | Pins and Ads endpoints are separate; needs approved boards. |
| YouTube | Data API v3 (organic) + Google Ads API (video ads) | Upload quota is limited. |
| Google Ads | Google Ads API | Developer token. Campaigns created PAUSED. |
| Amazon | Selling Partner API (Listings Items, Product Type Definitions) | Fetch product-type schemas dynamically. |
| Flipkart | Seller API | Seller account and approved categories. |
| Meesho | Supplier panel; no confirmed public API | Check first; likely CSV export. |
| Walmart | Marketplace API | Strict item spec versions; validate against schema. |
| Etsy | Open API v3 | Create as `draft`, activate after approval. |
| Shopify | Admin GraphQL API | Create as `DRAFT`, publish after approval. |
| WooCommerce | REST `wp-json/wc/v3` | Consumer key and secret per store. |
| Dukaan | Limited or unknown | Check first; fall back to export / import. |

Where a platform has no usable public API (possibly Meesho and Dukaan), do **not** scrape or automate a seller dashboard without asking. Build an "export package" connector (CSV + images zip) and flag it in the UI.

## 7. Approval and Safety Rules (CRITICAL)

Non-negotiable. Any change touching these needs a test, and your go-ahead before it is written (§16).

1. **Per-platform, per-item approval.** One `PublishRequest` per (item × platform).
2. **Approval binds to a content hash.** `Approval` stores the SHA-256 of the exact payload (copy, images, price, targeting). Any change invalidates it and returns the request to `pending_review`.
3. **No auto-publish path.** No code path from AI generation to `connector.publish()` may skip approval. Enforce this in the state machine, not only the UI.
4. **Approver ≠ requester is configurable.** POC default: any `approver` or `owner` may approve.
5. **Spend safety.** Ad campaigns are created paused, with a mandatory user-set daily budget cap. The app never raises a budget on its own.
6. **Live gate.** `mode: "live"` needs an explicit `owner` action plus a confirmation dialog naming the account.
7. **Idempotency.** Each `PublishJob` carries `(publishRequestId, attempt-group)`. Re-running a job must never double-post.
8. **Audit everything.** Approvals, rejections, publish attempts, token refreshes and edits write an append-only `AuditEvent`. Never update or delete audit rows.
9. **Kill switch.** An org-level "pause all publishing" flag is checked by the worker before every `publish()`.
10. **Content policy checks before review.** Prohibited claims, trademark and competitor names, medical or before/after claims, platform text-length rules, image size and format. Blocking failures prevent approval.

State machine (`src/server/approvals`, when created):

```
generated → pending_review → approved → queued → publishing → published
                 ↓              ↓                     ↓
             rejected     invalidated (payload edited)   failed → (retry | back to review)
```

## 8. AI Generation Guidelines

- **Structured output only.** Every LLM call returns JSON validated by Zod. On validation failure, retry once with the error message, then fail the step.
- **PKR is the only source of claims.** Copy and creatives state only facts in the PKR. Never invent specs, certifications, discounts or reviews. Missing data is left out and flagged.
- **Prompts** live in `src/server/ai/prompts/` as versioned files (`name.v3.md`). No inline prompt strings in app code. Log `promptVersion`, `modelId`, token usage and cost per call.
- **One gateway.** All model calls go through a single `ModelGateway` wrapping OpenRouter. No other provider key is used directly (Vercel AI SDK is for streaming UI only). Verify OpenRouter's image and video output docs before coding; keep per-model quirks in adapters behind the gateway. `OPENROUTER_API_KEY` is server-only.
- **Models are chosen in Settings → AI Models.** The list comes from OpenRouter's models endpoint, filtered by output modality (text / image / video), showing price and capabilities. Never hard-code model IDs; store them in `ModelSetting` with defaults in config. Record `modelId` on every generated asset. If a model is removed or fails, show a clear error and offer to switch.
- **Video ads:** 2–3 videos per product, 6–15 s, as scene storyboards of the product in believable everyday situations, using only PKR facts. Use the product photos as reference or first frame. Reject outputs where the product shape, logo or text is distorted. Run as an async job with polling or webhooks and show progress. Show estimated cost and require confirmation before starting. Post-process with ffmpeg: 9:16, 1:1 and 16:9 crops, burned-in captions, brand end-card, platform size and duration limits. No real people's likeness and no misleading claims; mark AI-generated where required.
- **Image ads:** keep the real product recognizable. Prefer editing and compositing the user's photos over pure text-to-image. Generate 5–6 as a varied set (lifestyle, flat-lay, benefit callout, offer, UGC style, close-up). Export 1:1, 4:5, 9:16, 16:9 and 2:3 (Pinterest). Marketplace main images (e.g., pure white background) come from a deterministic `sharp` step, not free-form generation.
- **Platform copy:** one generator per platform family, with Zod `max()` limits derived from that connector's `validate()` rules.
- **Safety:** no real people's likeness, copyrighted characters, or fake "official" badges or discounts. Add provenance metadata (C2PA or an internal flag) where the provider supports it.
- **Cost control:** cache by `(inputHash, promptVersion, modelId)`. Track cost per call. Cap per-product spend. Show estimated cost before any regeneration.
- **Evals:** keep a golden set of 5 products in `src/server/ai/evals/`. Run it when a prompt or model changes.

## 9. Background Jobs

- Long work (parsing, generation, publishing) runs in durable, resumable workers, never in a request handler.
- Pipeline: `ingest → extract_pkr → generate_creatives → generate_listings → policy_check → await_review`. Publishing is a separate workflow, triggered only by an approval event.
- Steps are idempotent. Store intermediate outputs in the DB or object storage, and stream step-level progress to the UI.

## 10. Frontend Guidelines

- Server Components by default. Add `"use client"` only for interactivity.
- Use shadcn/ui components from `src/components/ui`; do not hand-roll a button, dialog, table or card that shadcn provides. Add new ones with `npx shadcn@latest add <name>`. Style with Tailwind CSS v4 (tokens in `src/app/globals.css`); icons from Lucide.
- Key screens: products list, new-product wizard, product workspace (PKR · Image creatives · Videos · Listings · Publishing), review queue with side-by-side platform previews, connections (sandbox / live, token health), AI model settings, audit log.
- **Every publish action shows a confirm dialog** stating platform, account name, item, budget (if ads) and mode (sandbox / live). The primary button reads "Approve & publish to <Platform>", never a generic "Submit".
- Accessibility: keyboard navigable, labeled controls, WCAG AA contrast. **No optimistic updates on approval actions.**
- Platform previews match each channel's real layout (Meta feed, IG story, Pinterest pin, Amazon listing).

## 11. Backend (Next.js API)

- The API is route handlers under `src/app/api/**/route.ts`, plus Server Actions for form mutations.
- Validate every input and output with Zod. Return typed, normalized errors.
- Keep handlers thin: parse → call a server module → respond. No long-running work in handlers (§9). Rate-limit API and AI endpoints per user and per org.
- Before any auth ships: CSRF protection on mutations, strict CORS, and a CSP header (in `next.config.ts` or middleware).
- Current endpoint: `GET /api/health` (validated JSON, `Cache-Control: no-store`).

## 12. Security

- Never commit secrets. `.env*.local` is git-ignored. Env is validated in `src/lib/env.ts` with Zod. `.env.example` lists every key with no values.
- OAuth tokens: encrypt at rest, refresh proactively, minimal scopes, never log them, never send them to the client.
- Uploads: validate MIME type and magic bytes, cap size, sandbox document parsing, strip EXIF GPS data, use signed URLs with short TTLs.
- Uploaded documents are **untrusted input** and may contain prompt injection. Parse them into the PKR schema. Document text must never decide tool use or publishing.
- Enforce `org_id` scoping on every query (Drizzle helper or Postgres RLS). Write a test proving cross-tenant reads fail.
- Comply with each platform's developer policy. Don't store marketplace customer data.

## 13. Coding Standards

- TypeScript `strict` and `noUncheckedIndexedAccess`. No `any` (use `unknown` + Zod parse). `@ts-ignore` only with a comment explaining why.
- Small pure functions; explicit return types on exported functions. Keep files under ~300 lines.
- Naming: `camelCase` variables and functions; `PascalCase` types and components; `kebab-case` files; `SCREAMING_SNAKE` env vars.
- Throw typed errors (`ConnectorError`, `ValidationError`, `ApprovalError`). Never swallow errors. No `console.log` in committed code; use the logger.
- Dates in UTC ISO 8601. Money as integer minor units plus currency code. IDs are UUIDv7.
- Database changes only via migrations (`drizzle-kit generate`). Never edit an applied migration.
- Comments explain *why*, not *what*. Link the ADR or API doc for any platform quirk.

## 14. Testing Requirements

- **Unit:** schemas, policy checks, approval state machine (including every illegal transition), content-hash invalidation.
- **Connector contract tests:** every connector passes one shared suite against MSW mocks: validate, preview, publish success, rate limit, auth expiry, idempotent retry.
- **Integration:** workflows against a test DB and mock AI providers. **E2E (Playwright):** upload → generate (mocked AI) → review → approve → publish (sandbox) → status.
- **Required regression tests:** "cannot publish without approval", "editing after approval invalidates it", "kill switch blocks publishing", "cross-tenant access denied".
- Never call real AI or platform APIs in CI. Real-API smoke tests live in manual `npm run smoke:<platform>` scripts.

## 15. Commands

npm only. Do not use pnpm or yarn. Commit `package-lock.json`.

```bash
npm install            # install dependencies
npm run dev            # Next.js dev server (Turbopack)
npm run build          # production build
npm run start          # serve the production build
npm run lint           # Biome check (must pass before commit)
npm run lint:fix       # Biome check with auto-fix
npm run format         # Biome format --write
npm run typecheck      # tsc --noEmit (must pass before commit)
```

Not wired yet; add with their feature and update this list: `npm test` (Vitest), `npm run test:e2e` (Playwright), `db:generate`, `db:migrate`, `db:studio`, `ai:eval`, `smoke:<platform>`.

## 16. Workflow for Claude Code

1. **Plan before coding** for any task touching more than 3 files, the approval flow, or a connector. Give a short plan and wait for the go-ahead.
2. **Small vertical slices.** One working end-to-end path beats many half-built features.
3. **Verify, don't assume.** Before declaring done, run `npm run lint && npm run typecheck && npm run build` (plus `npm test` once it exists). Report what ran and the results.
4. **Check current docs** before using a third-party API, SDK or framework feature. For Next.js, read `node_modules/next/dist/docs/` first (see `AGENTS.md`).
5. **Ask before:** adding a major dependency, a breaking schema change, touching approval or security code, or any platform integration that needs scraping or unofficial APIs.
6. **Never** use real credentials, post to a real account, or spend real money during development. Use sandbox mode and mocks.
7. **Record decisions** as short ADRs in `docs/adr/NNNN-title.md` for non-obvious choices (queue, image provider, auth, layout).
8. **Git:** feature branches; never commit to `main` directly. Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`). Small PRs describing what changed and how it was tested.
9. **If blocked** (missing API access, unclear requirement), say so plainly and propose the next best option. Don't invent behavior.

## 17. Suggested Build Order

Foundation (scaffold ✅, auth, DB, uploads, CI) → ingestion (PKR + edit UI) → generation (creatives, copy, one listing) → review and approval (state machine, hashing, audit, queue) → first sandbox connectors (Shopify + Meta, or Etsy + Pinterest) → remaining connectors (mock first) → hardening (kill switch, spend caps, rate limits, e2e).

## 18. Definition of Done

Works in the UI or a test · `lint`, `typecheck`, `build` and tests pass · external calls go through a connector with a mock · approval and audit rules intact (§7) · no secrets or `console.log` · `.env.example` and docs updated · short summary of what changed and what is left.
