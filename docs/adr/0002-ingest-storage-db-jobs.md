# 0002 — Ingest storage, database, job runner and dev session

## Status
Accepted (Step 01, Add Product)

## Context
Step 01 needs persistence for products and assets, object storage for uploaded files, and a durable runner for the `ingest` pipeline step. CLAUDE.md §3 offers several options. Hosted services and auth are not chosen yet, and the POC runs locally.

## Decision
- **Database:** PostgreSQL with Drizzle ORM and `drizzle-kit` migrations, through the `postgres` driver. Local dev runs Postgres in Docker (`docker-compose.yml`). Neon can be swapped in by changing `DATABASE_URL`.
- **Object storage:** S3-compatible API via `@aws-sdk/client-s3` and presigned URLs. Local dev runs MinIO. Cloudflare R2 can be swapped in by changing the endpoint.
- **Durable jobs:** Inngest. Its step functions map one-to-one to the `ingest` steps (`load_assets`, `parse_document`, `finalize`). The dev server runs locally.
- **Auth:** not in this step. `getSession()` reads `DEV_SESSION_ORG_ID` outside production and throws in production. The real provider (Clerk or Better Auth) is a later step.
- **Deferred to the auth step:** CSRF protection and the CSP header (CLAUDE.md §11, §12). Mutations are POST/DELETE route handlers, so they are ready for that work.
- **Audit:** `audit_events` is append-only, enforced by a Postgres trigger that rejects UPDATE and DELETE.

## Consequences
- Local development needs Docker. Hosted services are a configuration change, not a code change.
- Inngest adds one runtime dependency and a dev server. It runs inside the Next.js deployment.
- Until auth ships, the app must not be deployed anywhere reachable by real users. `getSession()` enforces this in production.
- Related: CLAUDE.md §3, §9, §11, §12; spec `.claude/specs/01-add-product.md`.
