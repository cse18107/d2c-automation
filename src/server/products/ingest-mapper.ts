import { type IngestJob, ingestJobSchema } from "@/schemas/ingest";
import type { ingestJobs } from "@/server/db/schema";
import { toIso } from "./iso";

type IngestJobRow = typeof ingestJobs.$inferSelect;

// The steps column is jsonb. Parse it on the way out so a malformed row fails
// loudly here instead of leaking into the UI.
export function toIngestJob(row: IngestJobRow): IngestJob {
  return ingestJobSchema.parse({
    id: row.id,
    orgId: row.orgId,
    productId: row.productId,
    attemptGroup: row.attemptGroup,
    status: row.status,
    steps: row.steps,
    errorCode: row.errorCode,
    idempotencyKey: row.idempotencyKey,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  });
}
