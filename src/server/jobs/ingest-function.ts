import "server-only";
import { getDb } from "@/server/db";
import {
  failIngest,
  finalizeIngest,
  type IngestScope,
  isJobActive,
  loadAndCheckAssets,
  markJobRunning,
  parseDocumentStep,
} from "@/server/ingest/workflow";
import {
  INGEST_REQUESTED_EVENT,
  type IngestRequestedData,
  inngest,
} from "./client";

// Durable run for one ingest job. Each step is memoized by Inngest, so a retry
// resumes at the failed step. Expected failures are returned as data (see
// StepOutcome) and recorded; anything unexpected throws and Inngest retries.
export const ingestProduct = inngest.createFunction(
  {
    id: "ingest-product",
    triggers: [{ event: INGEST_REQUESTED_EVENT }],
    retries: 2,
    onFailure: async ({ event }) => {
      const original = (event.data as { event: { data: IngestRequestedData } })
        .event.data;
      await failIngest(
        getDb(),
        toScope(original),
        "TRANSIENT",
        "Processing failed after several attempts",
      );
    },
  },
  async ({ event, step }) => {
    const db = getDb();
    const scope = toScope(event.data as IngestRequestedData);

    const started = await step.run("start", () => markJobRunning(db, scope));
    if (!started) return { status: "stopped" as const };

    const loaded = await step.run("load-assets", () =>
      loadAndCheckAssets(db, scope),
    );
    if (!loaded.ok) {
      await step.run("record-failure", () =>
        failIngest(db, scope, loaded.code, loaded.message),
      );
      return { status: "failed" as const, code: loaded.code };
    }

    const parsed = await step.run("parse-document", () =>
      parseDocumentStep(db, scope),
    );
    if (!parsed.ok) {
      await step.run("record-failure-parse", () =>
        failIngest(db, scope, parsed.code, parsed.message),
      );
      return { status: "failed" as const, code: parsed.code };
    }

    const stillActive = await step.run("check-cancelled", () =>
      isJobActive(db, scope),
    );
    if (!stillActive) return { status: "stopped" as const };

    await step.run("finalize", () => finalizeIngest(db, scope));
    return { status: "succeeded" as const };
  },
);

function toScope(data: IngestRequestedData): IngestScope {
  return {
    orgId: data.orgId,
    productId: data.productId,
    jobId: data.jobId,
    actorId: data.actorId,
  };
}
