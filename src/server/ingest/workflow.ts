import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import type { IngestStep } from "@/schemas/ingest";
import { recordAuditEvent } from "@/server/audit";
import type { Db } from "@/server/db";
import { ingestJobs, productAssets, products } from "@/server/db/schema";
import { withOrg } from "@/server/db/with-org";
import { AppError } from "@/server/errors";
import { readObject } from "@/server/storage";
import { MAX_PDF_PAGES } from "@/server/uploads/rules";
import { parseDocument } from "./parsers";

export type IngestScope = {
  orgId: string;
  productId: string;
  jobId: string;
  actorId: string;
};

// A step outcome is data, not a thrown error. Inngest replays thrown errors
// without their class, so a permanent failure is returned and handled explicitly.
export type StepOutcome =
  | { ok: true }
  | { ok: false; code: "VALIDATION" | "PERMANENT"; message: string };

const ACTIVE_STATUSES = ["queued", "running"] as const;

export async function markJobRunning(
  db: Db,
  scope: IngestScope,
): Promise<boolean> {
  const [row] = await db
    .update(ingestJobs)
    .set({ status: "running" })
    .where(
      and(
        withOrg(ingestJobs, scope.orgId),
        eq(ingestJobs.id, scope.jobId),
        inArray(ingestJobs.status, [...ACTIVE_STATUSES]),
      ),
    )
    .returning({ id: ingestJobs.id });
  // A cancelled or already-finished job is not an error: the run just stops.
  return row !== undefined;
}

export async function isJobActive(
  db: Db,
  scope: IngestScope,
): Promise<boolean> {
  const [row] = await db
    .select({ status: ingestJobs.status })
    .from(ingestJobs)
    .where(
      and(withOrg(ingestJobs, scope.orgId), eq(ingestJobs.id, scope.jobId)),
    )
    .limit(1);
  return row !== undefined && row.status === "running";
}

async function updateStep(
  db: Db,
  scope: IngestScope,
  name: IngestStep["name"],
  patch: Partial<IngestStep>,
) {
  const [job] = await db
    .select({ steps: ingestJobs.steps })
    .from(ingestJobs)
    .where(
      and(withOrg(ingestJobs, scope.orgId), eq(ingestJobs.id, scope.jobId)),
    )
    .limit(1);
  if (!job) return;
  const steps = (job.steps as IngestStep[]).map((step) =>
    step.name === name ? { ...step, ...patch } : step,
  );
  await db
    .update(ingestJobs)
    .set({ steps })
    .where(
      and(withOrg(ingestJobs, scope.orgId), eq(ingestJobs.id, scope.jobId)),
    );
}

export async function beginStep(
  db: Db,
  scope: IngestScope,
  name: IngestStep["name"],
): Promise<void> {
  await updateStep(db, scope, name, {
    status: "running",
    startedAt: new Date().toISOString(),
    error: null,
  });
}

// Checks that the product still has what it needs: at least one verified photo
// and one document, and a PDF within the page cap.
export async function loadAndCheckAssets(
  db: Db,
  scope: IngestScope,
): Promise<StepOutcome> {
  await beginStep(db, scope, "load_assets");
  const assets = await db
    .select({
      kind: productAssets.kind,
      verifiedAt: productAssets.verifiedAt,
      mimeType: productAssets.mimeType,
    })
    .from(productAssets)
    .where(
      and(
        withOrg(productAssets, scope.orgId),
        eq(productAssets.productId, scope.productId),
      ),
    );
  const verified = assets.filter((a) => a.verifiedAt !== null);

  let outcome: StepOutcome = { ok: true };
  if (!verified.some((a) => a.kind === "image")) {
    outcome = {
      ok: false,
      code: "VALIDATION",
      message: "No verified product photo was found",
    };
  } else if (!verified.some((a) => a.kind === "document")) {
    outcome = {
      ok: false,
      code: "VALIDATION",
      message: "No verified product document was found",
    };
  }
  await updateStep(db, scope, "load_assets", {
    status: outcome.ok ? "succeeded" : "failed",
    finishedAt: new Date().toISOString(),
    error: outcome.ok ? null : outcome.message,
  });
  return outcome;
}

// Reads the document from storage, parses it, and stores the text on the asset.
// Re-running overwrites the same column with the same text, so it is idempotent.
export async function parseDocumentStep(
  db: Db,
  scope: IngestScope,
): Promise<StepOutcome> {
  await beginStep(db, scope, "parse_document");
  const [doc] = await db
    .select()
    .from(productAssets)
    .where(
      and(
        withOrg(productAssets, scope.orgId),
        eq(productAssets.productId, scope.productId),
        eq(productAssets.kind, "document"),
      ),
    )
    .limit(1);
  if (!doc || !doc.verifiedAt) {
    return failStep(
      db,
      scope,
      "parse_document",
      "VALIDATION",
      "No verified product document was found",
    );
  }

  try {
    const bytes = await readObject(doc.storageKey);
    const parsed = await parseDocument(doc.mimeType, bytes);
    if (parsed.pages !== null && parsed.pages > MAX_PDF_PAGES) {
      return failStep(
        db,
        scope,
        "parse_document",
        "VALIDATION",
        `PDFs can have at most ${MAX_PDF_PAGES} pages`,
      );
    }
    await db
      .update(productAssets)
      .set({ parsedText: parsed.text })
      .where(
        and(withOrg(productAssets, scope.orgId), eq(productAssets.id, doc.id)),
      );
    await updateStep(db, scope, "parse_document", {
      status: "succeeded",
      finishedAt: new Date().toISOString(),
      error: null,
    });
    return { ok: true };
  } catch (error: unknown) {
    // Only typed, expected failures become a failed step. Anything else (for
    // example a storage outage) is rethrown so Inngest retries the step.
    if (
      error instanceof AppError &&
      (error.code === "VALIDATION" || error.code === "PERMANENT")
    ) {
      return failStep(db, scope, "parse_document", error.code, error.message);
    }
    throw error;
  }
}

async function failStep(
  db: Db,
  scope: IngestScope,
  name: IngestStep["name"],
  code: "VALIDATION" | "PERMANENT",
  message: string,
): Promise<StepOutcome> {
  await updateStep(db, scope, name, {
    status: "failed",
    finishedAt: new Date().toISOString(),
    error: message,
  });
  return { ok: false, code, message };
}

// Success: the job succeeds and the product returns to draft with ingested_at
// set (spec Q4). Conditional updates mean a cancel that already landed wins.
export async function finalizeIngest(
  db: Db,
  scope: IngestScope,
): Promise<void> {
  await beginStep(db, scope, "finalize");
  await db.transaction(async (tx) => {
    const [job] = await tx
      .update(ingestJobs)
      .set({ status: "succeeded" })
      .where(
        and(
          withOrg(ingestJobs, scope.orgId),
          eq(ingestJobs.id, scope.jobId),
          eq(ingestJobs.status, "running"),
        ),
      )
      .returning({ id: ingestJobs.id });
    if (!job) return;

    const now = new Date().toISOString();
    await tx
      .update(products)
      .set({ status: "draft", ingestedAt: now })
      .where(
        and(
          withOrg(products, scope.orgId),
          eq(products.id, scope.productId),
          eq(products.status, "processing"),
        ),
      );
    await recordAuditEvent(tx, {
      orgId: scope.orgId,
      actorId: scope.actorId,
      action: "ingest.succeeded",
      entityType: "product",
      entityId: scope.productId,
      metadata: { jobId: scope.jobId },
    });
  });
  await updateStep(db, scope, "finalize", {
    status: "succeeded",
    finishedAt: new Date().toISOString(),
    error: null,
  });
}

// Failure: the job and product both move to failed. Cancelled jobs stay cancelled.
export async function failIngest(
  db: Db,
  scope: IngestScope,
  code: string,
  message: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [job] = await tx
      .update(ingestJobs)
      .set({ status: "failed", errorCode: code })
      .where(
        and(
          withOrg(ingestJobs, scope.orgId),
          eq(ingestJobs.id, scope.jobId),
          inArray(ingestJobs.status, [...ACTIVE_STATUSES]),
        ),
      )
      .returning({ id: ingestJobs.id });
    if (!job) return;

    await tx
      .update(products)
      .set({ status: "failed" })
      .where(
        and(
          withOrg(products, scope.orgId),
          eq(products.id, scope.productId),
          eq(products.status, "processing"),
        ),
      );
    await recordAuditEvent(tx, {
      orgId: scope.orgId,
      actorId: scope.actorId,
      action: "ingest.failed",
      entityType: "product",
      entityId: scope.productId,
      metadata: { jobId: scope.jobId, errorCode: code, message },
    });
  });
}
