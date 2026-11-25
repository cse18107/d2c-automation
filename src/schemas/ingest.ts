import { z } from "zod";
import { idSchema, isoDateTimeSchema, orgScopedSchema } from "./common";

export const INGEST_JOB_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
] as const;
export const ingestJobStatusSchema = z.enum(INGEST_JOB_STATUSES);
export type IngestJobStatus = z.infer<typeof ingestJobStatusSchema>;

export const ingestStepSchema = z.object({
  name: z.enum(["load_assets", "parse_document", "finalize"]),
  status: z.enum(["pending", "running", "succeeded", "failed", "skipped"]),
  startedAt: isoDateTimeSchema.nullable(),
  finishedAt: isoDateTimeSchema.nullable(),
  error: z.string().nullable(),
});
export type IngestStep = z.infer<typeof ingestStepSchema>;

export const ingestJobSchema = orgScopedSchema.extend({
  productId: idSchema,
  attemptGroup: idSchema,
  status: ingestJobStatusSchema,
  steps: z.array(ingestStepSchema),
  errorCode: z.string().nullable(),
  idempotencyKey: z.string().min(1).max(255),
});
export type IngestJob = z.infer<typeof ingestJobSchema>;
