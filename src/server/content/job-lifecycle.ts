import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import type { ProductStatus } from "@/schemas/product";
import { recordAuditEvent } from "@/server/audit";
import type { Db } from "@/server/db";
import { contentJobs, products } from "@/server/db/schema";
import { withOrg } from "@/server/db/with-org";
import { AppError } from "@/server/errors";
import { assertTransition } from "@/server/products/product-status";
import type { StageScope } from "./stages/context";

// Job-level state changes. Each one is a single conditional update, so a retried
// Inngest step cannot move a job backwards or finish it twice.

export async function markContentJobRunning(
  db: Db,
  scope: StageScope,
): Promise<boolean> {
  const rows = await db
    .update(contentJobs)
    .set({ status: "running" })
    .where(
      and(
        withOrg(contentJobs, scope.orgId),
        eq(contentJobs.id, scope.jobId),
        eq(contentJobs.status, "queued"),
      ),
    )
    .returning({ id: contentJobs.id });
  return rows.length > 0;
}

async function setProductStatus(
  db: Db,
  scope: StageScope,
  to: ProductStatus,
): Promise<void> {
  const [row] = await db
    .select({ status: products.status })
    .from(products)
    .where(
      and(withOrg(products, scope.orgId), eq(products.id, scope.productId)),
    )
    .limit(1);
  if (!row) return;
  assertTransition(row.status, to);
  await db
    .update(products)
    .set({ status: to })
    .where(
      and(withOrg(products, scope.orgId), eq(products.id, scope.productId)),
    );
}

export async function markContentJobSucceeded(
  db: Db,
  scope: StageScope,
): Promise<void> {
  await db
    .update(contentJobs)
    .set({ status: "succeeded" })
    .where(
      and(
        withOrg(contentJobs, scope.orgId),
        eq(contentJobs.id, scope.jobId),
        eq(contentJobs.status, "running"),
      ),
    );
  await setProductStatus(db, scope, "ready_for_review");
  await recordAuditEvent(db, {
    orgId: scope.orgId,
    actorId: scope.actorId,
    action: "content.succeeded",
    entityType: "product",
    entityId: scope.productId,
    metadata: { jobId: scope.jobId },
  });
}

// Records a failed run. Safe to call more than once: only an active job changes.
export async function failContentJob(
  db: Db,
  scope: StageScope,
  errorCode: "VALIDATION" | "PERMANENT" | "TRANSIENT",
  message: string,
): Promise<void> {
  const rows = await db
    .update(contentJobs)
    .set({ status: "failed", errorCode, errorMessage: message })
    .where(
      and(
        withOrg(contentJobs, scope.orgId),
        eq(contentJobs.id, scope.jobId),
        inArray(contentJobs.status, ["queued", "running"]),
      ),
    )
    .returning({ id: contentJobs.id });
  if (rows.length === 0) return;
  try {
    await setProductStatus(db, scope, "failed");
  } catch (error) {
    // A product that is not in processing (for example edited meanwhile) keeps
    // its status. The job is still recorded as failed.
    if (!(error instanceof AppError)) throw error;
  }
  await recordAuditEvent(db, {
    orgId: scope.orgId,
    actorId: scope.actorId,
    action: "content.failed",
    entityType: "product",
    entityId: scope.productId,
    metadata: { jobId: scope.jobId, errorCode },
  });
}
