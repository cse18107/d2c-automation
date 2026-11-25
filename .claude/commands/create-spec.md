---
description: Create a spec file and feature branch for a D2C Autopilot feature
argument-hint: Step number and feature name, e.g. 02 product-upload or 07 listings-review
allowed-tools: Read, Write, Glob, Grep, Bash(git:*)
---

You are a senior engineer writing a spec for **D2C Autopilot** (`d2c-autopilot`),
a modular D2C marketing and marketplace-listing automation platform.
`CLAUDE.md` is the source of truth. If this command conflicts with `CLAUDE.md`,
follow `CLAUDE.md` and say so in your report.

This command writes a spec only. It does not write application code.

User input: $ARGUMENTS

## Step 1 — Check git state
1. Run `git rev-parse --is-inside-work-tree`. If this fails, stop and tell the user
   to run `git init -b main` at the project root.
2. Run `git rev-parse --verify main`. If `main` does not exist (no commits yet), stop
   and tell the user to commit the current scaffold to `main` first. Do not commit on
   the user's behalf.
3. Run `git status --porcelain`. If there is any output, stop and tell the user to
   commit or stash changes first. Do not continue until the tree is clean.

## Step 2 — Parse the arguments
From $ARGUMENTS extract:

1. `step_number`: zero-padded to 2 digits (`2` → `02`, `11` → `11`).
2. `feature_title`: human-readable Title Case (e.g. "Product Upload").
3. `feature_slug`: lowercase kebab-case, only `a-z`, `0-9`, `-`, maximum 40 characters
   (e.g. `product-upload`).
4. `branch_name`: `feature/<feature_slug>`.

If any value cannot be inferred from $ARGUMENTS, ask the user before continuing.

## Step 3 — Check the branch name is free
Run `git branch --list` and `git branch --list "feature/<feature_slug>*"`.
If `feature/<feature_slug>` already exists, use `feature/<feature_slug>-02`,
`-03`, and so on.

## Step 4 — Create the feature branch from main
Run:
```
git checkout main
git checkout -b <branch_name>
```
If `origin` is configured (`git remote get-url origin` succeeds), run
`git pull --ff-only origin main` before creating the branch. If there is no remote,
skip the pull and say so in the report.

## Step 5 — Research before writing
Read these in full:
- `CLAUDE.md`: §1 product, §2 scope (POC), §7 approval and safety rules, §8 AI
  rules, §13 coding standards, §14 test requirements, §16 workflow.
- `AGENCY_BUSINESS_PLANNING.md`: which service module this feature belongs to.
- All existing files in `.claude/specs/` so the spec does not duplicate or contradict
  one. Use Glob to list them.
- The current code under `src/` (Glob, then Read only what is relevant).
- The design file `design-assets/Untitled.fig`, opened with the OpenPencil tools
  (`open_document`, then `get_page_tree` with `depth` and `root_id`, or `describe`).
  The page is "Page 1". Frames are numbered; the screen map is in the table below.

### Design screen map (`design-assets/Untitled.fig`, Page 1)

| Frame | Node ID | Screen |
|---|---|---|
| 00 Design System | 33178720:235 | Type, colour, component tokens |
| 01 Products List | 33178720:340 | Product table with status filters |
| 02 New Product Wizard - Upload | 33178720:470 | Upload images and document |
| 03 Processing | 33178720:537 | Pipeline progress |
| 04 Product Workspace - PKR | 33178720:609 | Product Knowledge Record review |
| 05 Workspace - Image Creatives | 33178720:688 | 5–6 image ad creatives |
| 06 Workspace - Videos + Cost Confirm | 33178720:773 | 2–3 video ads |
| 06b Dialog - Confirm Video Cost | 33178720:1416 | Cost confirmation before a video job |
| 07 Workspace - Listings | 33178720:836 | Marketplace listing assets |
| 08 Review Queue - Platform Previews | 33178720:900 | Review per platform |
| 09 Dialog - Approve and Publish | 33178720:971 | Approval dialog |
| 10 Publishing Jobs | 33178720:989 | Job status, external IDs, retries |
| 11 Connections + Live Mode Gate | 33178720:1084 | Sandbox/live connections, token health |
| 11b Dialog - Live Mode Gate | 33178720:1428 | Live-mode confirmation |
| 12 AI Models Settings | 33178720:1158 | Model selection and spend caps |
| 13 Audit Log | 33178720:1225 | Append-only event list |
| 14 Empty and Error States | 33178720:1313 | Empty and error states |
| 15 Settings and Kill Switch | 33178720:1360 | Org-wide pause of publishing |
| 16 Navigation and Workflow Map | 33178720:1443 | Happy path and exception paths |
| 17 Product 01 Input and AI Outputs | 33178720:1493 | Sample input and AI outputs |

Design rules from the file: desktop-first, Inter-style sans, 8px grid, 8px radius.
Amber marks sandbox and red marks live. Every publish action names its platform.

If the feature has a screen in the design, cite its node ID. If it has no screen,
say so in the spec and do not invent one.

## Step 6 — Check the step is not already done
Check `CLAUDE.md` §17 (build order) and the existing specs. If this feature is
already specified or marked complete, warn the user and stop.

## Step 7 — Write the spec
Use this structure exactly:

---
# Spec: <feature_title>

**Step:** <step_number> · **Branch:** <branch_name> · **Status:** draft
**Module:** <one of: Core Platform, Product Content, E-commerce, Advertising,
Post-Sale Verification, Customer Support, Broadcast, Voice, Shared Infrastructure>
**Plan required before coding:** yes / no (see rule below)

## 1. Overview
What this feature does, which user problem it solves for a D2C brand, and where it
sits in the pipeline (`ingest → extract_pkr → generate_creatives → generate_listings
→ policy_check → await_review`, then publish).

## 2. Scope
- **In scope:** bullet list.
- **Out of scope:** bullet list. Anything outside CLAUDE.md §2 (POC scope) goes in
  here or in Open questions. Do not add it to In scope without asking.

## 3. Users and roles
Which roles (`owner`, `approver`, `editor`, `viewer`) can do what.

## 4. Screens and flows
- Design frames used (node IDs from the table above), or "No design frame".
- Step-by-step user flow.
- States: loading, empty, error, success. Each must be visible in the UI.

## 5. Data model
- Entities and fields, with Zod schema names in `src/schemas` and matching Drizzle tables.
- Every table has `id` (UUIDv7), `created_at`, `updated_at`, `org_id`.
- Migrations via `drizzle-kit generate` only. Name the migration.
- Money as integer minor units plus currency code. Dates as UTC ISO 8601.

## 6. API and server modules
- Route handlers under `src/app/api/**/route.ts`, with Zod input and output schemas.
- Server modules and their `index.ts` public exports (`src/server/...`).
- Long work runs as a durable background job, never in a handler.

## 7. Approval and safety impact (CRITICAL)
Answer each item explicitly: "No impact" or a description.
- Does it create, change, or publish a `PublishRequest` or `Approval`? If yes, the
  state machine in `src/server/approvals` must enforce it, not only the UI.
- Does editing this content invalidate an existing approval (content hash, §7.2)?
- Does it touch spend or budgets (§7.5)?
- Does it touch the live gate or kill switch (§7.6, §7.9)?
- Does it write audit events (§7.8)?
- Does it touch AI generation or connectors (§8, §6)? Connectors never import the AI gateway.

## 8. Content policy and AI rules
- Which policy checks apply (prohibited claims, trademarks, medical or before/after
  claims, platform text limits, image size and format).
- Which AI calls are made, the prompt file under `src/server/ai/prompts/` with a
  version, and the Zod schema for the output.
- Confirm the PKR is the only source of claims. Missing facts are flagged, not invented.

## 9. Connectors
- Platform and kind (`ad | marketplace | store`), or "None".
- Sandbox behaviour and `*.mock.ts` file.
- `ConnectorError` codes that can occur.

## 10. Security and tenancy
- Every query is scoped by `org_id`.
- Uploads: MIME and magic-byte checks, size cap, EXIF GPS stripped, short-TTL signed URLs.
- Uploaded documents are untrusted input. Document text never decides tool use or publishing.
- No token or secret is logged or sent to the client.

## 11. Files to change
Existing files, with one line each on what changes.

## 12. Files to create
New files, with one line each on purpose. Keep files under ~300 lines.

## 13. New dependencies
Name, version (checked against the current official docs), and why. Adding a major
dependency needs the user's approval (CLAUDE.md §16.5). If none: "No new dependencies".

## 14. Tests
- Unit: schemas, policy checks, state transitions (including every illegal one),
  content-hash invalidation.
- Integration: workflow against a test DB and mocked AI.
- Required regression tests if the feature touches them:
  "cannot publish without approval", "editing after approval invalidates it",
  "kill switch blocks publishing", "cross-tenant access denied".
- Connector contract tests (MSW) if a connector is involved.
- No real AI or platform API calls in CI.

## 15. Rules for implementation
- Follow CLAUDE.md §13 (strict TypeScript, no `any`, no `console.log`, typed errors).
- Use shadcn/ui components from `src/components/ui`. Do not hand-roll them.
- Server Components by default. `"use client"` only for interactivity.
- Every publish action shows a confirm dialog that names the platform, account,
  item, budget (if ads) and mode. The primary button reads "Approve & publish to <Platform>".
- No optimistic updates on approval actions.
- Use npm only.

## 16. Open questions
Anything the spec cannot settle without the user. Do not guess these.

## 17. Definition of done
A checklist where each item can be verified by running the app or a test:
- [ ] `npm run lint` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run build` passes
- [ ] Tests for this feature pass (`npm test` once wired)
- [ ] Each screen listed in §4 renders with its loading, empty and error states
- [ ] Each rule in §7 that applies has a test
- [ ] No secrets or `console.log` in the diff
- [ ] `.env.example` and docs updated if a new env key was added
---

## Step 8 — Plan rule
Set **Plan required before coding** to `yes` if the feature touches the approval
flow (§7), a connector (§6), a security or tenancy boundary (§10), a breaking schema
change, or more than 3 files (CLAUDE.md §16.1). When it is `yes`, the spec ends
with a short Plan section and the implementation must wait for the user's go-ahead.

## Step 9 — Save the spec
Save to: `.claude/specs/<step_number>-<feature_slug>.md`

Do not commit the spec. The user reviews it first.

## Step 10 — Report
Print exactly this block:
```
Branch:    <branch_name>
Spec file: .claude/specs/<step_number>-<feature_slug>.md
Title:     <feature_title>
Plan req:  yes | no
```

Then add one line:
"Review the spec, then enter Plan Mode with Shift+Tab twice to begin implementation."

If the feature needs a plan, say so and do not start implementation.

Do not print the full spec in chat unless the user asks.
