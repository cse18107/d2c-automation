# 0001 — Single Next.js app with shadcn/ui (Radix base)

## Status
Accepted

## Context
CLAUDE.md originally described an npm-workspaces + Turborepo monorepo. The first request was a Next.js web app using Tailwind CSS, shadcn/ui and Next.js route handlers for the backend.

## Decision
- Start with one Next.js App Router app at the repo root (`src/app`), with the backend in route handlers under `src/app/api`.
- Use the shadcn/ui `radix-vega` preset (Radix primitives). The default `base-nova` preset uses Base UI, which does not match CLAUDE.md §3.
- Use Biome for lint and format, and `tsc --noEmit` for typecheck.
- Split into `packages/*` and `apps/*` later, when the worker and shared packages are needed.

## Consequences
- Simpler start, one `npm run dev`, one deploy target.
- The monorepo layout in the original CLAUDE.md is deferred, not dropped. Moving to it is a separate ADR.
- The shadcn CLI is a dev dependency only, which keeps the production audit clean.

Related: CLAUDE.md §4.
