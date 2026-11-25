import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { idColumn, orgIdColumn, timestamps } from "./columns";

// Content generation tables (spec §5). Money is integer minor units (CLAUDE.md
// §13). Generated rows are immutable: regeneration inserts a new version.

export const pkrStatusEnum = pgEnum("pkr_status", ["generated", "superseded"]);

export const pkrs = pgTable(
  "pkrs",
  {
    id: idColumn(),
    orgId: orgIdColumn(),
    productId: uuid("product_id").notNull(),
    version: integer("version").notNull(),
    status: pkrStatusEnum("status").notNull().default("generated"),
    body: jsonb("body").notNull(),
    inputHash: text("input_hash").notNull(),
    promptVersion: text("prompt_version").notNull(),
    modelId: text("model_id").notNull(),
    costMinor: integer("cost_minor").notNull().default(0),
    currency: text("currency").notNull().default("USD"),
    ...timestamps,
  },
  (t) => [uniqueIndex("pkrs_product_version_uq").on(t.productId, t.version)],
);

export const creativeKindEnum = pgEnum("creative_kind", ["image", "video"]);

export const creativeStatusEnum = pgEnum("creative_status", [
  "queued",
  "running",
  "generated",
  "blocked",
  "pending_review",
  "failed",
  "expired",
  "rejected",
]);

// One table for image and video creatives. A video row carries the provider job
// id and is never resubmitted once that id is set (ADR 0004).
export const creatives = pgTable(
  "creatives",
  {
    id: idColumn(),
    orgId: orgIdColumn(),
    productId: uuid("product_id").notNull(),
    pkrId: uuid("pkr_id"),
    kind: creativeKindEnum("kind").notNull(),
    slot: text("slot").notNull(),
    version: integer("version").notNull(),
    status: creativeStatusEnum("status").notNull(),
    modelId: text("model_id").notNull(),
    promptVersion: text("prompt_version").notNull(),
    inputHash: text("input_hash").notNull(),
    durationSeconds: integer("duration_seconds"),
    // Captions and end card for video rows, kept until post-processing runs.
    storyboard: jsonb("storyboard"),
    providerJobId: text("provider_job_id"),
    providerStatus: text("provider_status"),
    costMinor: integer("cost_minor").notNull().default(0),
    currency: text("currency").notNull().default("USD"),
    errorMessage: text("error_message"),
    policyFindings: jsonb("policy_findings")
      .notNull()
      .default(sql`'[]'::jsonb`),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("creatives_product_slot_version_uq").on(
      t.productId,
      t.kind,
      t.slot,
      t.version,
    ),
    uniqueIndex("creatives_provider_job_uq")
      .on(t.providerJobId)
      .where(sql`${t.providerJobId} is not null`),
    index("creatives_org_product_idx").on(t.orgId, t.productId),
  ],
);

// Stored output files. Keys are server-generated; URLs are signed per request.
export const creativeRenders = pgTable(
  "creative_renders",
  {
    id: idColumn(),
    orgId: orgIdColumn(),
    creativeId: uuid("creative_id").notNull(),
    variant: text("variant").notNull(),
    storageKey: text("storage_key").notNull(),
    mediaType: text("media_type").notNull(),
    width: integer("width"),
    height: integer("height"),
    bytes: integer("bytes").notNull(),
    sha256: text("sha256").notNull(),
    aiGenerated: boolean("ai_generated").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("creative_renders_creative_variant_uq").on(
      t.creativeId,
      t.variant,
    ),
  ],
);

export const listingTargetEnum = pgEnum("listing_target", [
  "marketplace",
  "ad_copy",
]);

export const listingTexts = pgTable(
  "listing_texts",
  {
    id: idColumn(),
    orgId: orgIdColumn(),
    productId: uuid("product_id").notNull(),
    pkrId: uuid("pkr_id"),
    target: listingTargetEnum("target").notNull(),
    version: integer("version").notNull(),
    status: creativeStatusEnum("status").notNull(),
    body: jsonb("body").notNull(),
    modelId: text("model_id").notNull(),
    promptVersion: text("prompt_version").notNull(),
    inputHash: text("input_hash").notNull(),
    costMinor: integer("cost_minor").notNull().default(0),
    currency: text("currency").notNull().default("USD"),
    policyFindings: jsonb("policy_findings")
      .notNull()
      .default(sql`'[]'::jsonb`),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("listing_texts_product_target_version_uq").on(
      t.productId,
      t.target,
      t.version,
    ),
  ],
);

export const contentJobStatusEnum = pgEnum("content_job_status", [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);

export const contentJobs = pgTable(
  "content_jobs",
  {
    id: idColumn(),
    orgId: orgIdColumn(),
    productId: uuid("product_id").notNull(),
    attemptGroup: uuid("attempt_group").notNull(),
    status: contentJobStatusEnum("status").notNull().default("queued"),
    steps: jsonb("steps").notNull().default(sql`'[]'::jsonb`),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    // Which run this is: text, images or videos (older rows are "all").
    scope: text("scope").notNull().default("all"),
    // Run options: videoCount, videoDurationSeconds, slots.
    options: jsonb("options").notNull().default(sql`'{}'::jsonb`),
    capMinor: integer("cap_minor"),
    spentMinor: integer("spent_minor").notNull().default(0),
    currency: text("currency").notNull().default("USD"),
    idempotencyKey: text("idempotency_key").notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("content_jobs_idempotency_uq").on(t.idempotencyKey),
    // At most one active job per product (spec §5, §6).
    uniqueIndex("content_jobs_one_active_uq")
      .on(t.productId)
      .where(sql`${t.status} in ('queued', 'running')`),
  ],
);

// Every paid model call (spec §8). Append-only: see the custom migration that
// rejects UPDATE and DELETE.
export const aiCalls = pgTable(
  "ai_calls",
  {
    id: idColumn(),
    orgId: orgIdColumn(),
    productId: uuid("product_id").notNull(),
    contentJobId: uuid("content_job_id"),
    purpose: text("purpose").notNull(),
    promptVersion: text("prompt_version").notNull(),
    modelId: text("model_id").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costMinor: integer("cost_minor").notNull().default(0),
    currency: text("currency").notNull().default("USD"),
    status: text("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("ai_calls_product_idx").on(t.productId)],
);
