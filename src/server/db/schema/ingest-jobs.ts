import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { INGEST_JOB_STATUSES } from "../../../schemas/ingest";
import { idColumn, orgIdColumn, timestamps } from "./columns";

export const ingestJobStatusEnum = pgEnum(
  "ingest_job_status",
  INGEST_JOB_STATUSES,
);

export const ingestJobs = pgTable(
  "ingest_jobs",
  {
    id: idColumn(),
    orgId: orgIdColumn(),
    productId: uuid("product_id").notNull(),
    attemptGroup: uuid("attempt_group").notNull(),
    status: ingestJobStatusEnum("status").notNull().default("queued"),
    steps: jsonb("steps").notNull().$type<unknown[]>().default([]),
    errorCode: text("error_code"),
    // Unique per org, not globally: two tenants may pick the same key.
    idempotencyKey: text("idempotency_key").notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("ingest_jobs_org_idem_uq").on(t.orgId, t.idempotencyKey),
    index("ingest_jobs_product_idx").on(t.productId),
  ],
);
