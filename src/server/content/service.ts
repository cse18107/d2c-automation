import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { v7 } from "uuid";
import { getAiEnv } from "@/lib/env";
import {
  type ContentEstimate,
  type ContentOutputs,
  type ContentScope,
  type JobOptions,
  type JobView,
  RUNNABLE_SLOTS,
  type StartContentInput,
} from "@/schemas/content-job";
import { VIDEO_LIMITS } from "@/schemas/limits";
import type { ProductStatus } from "@/schemas/product";
import { recordAuditEvent } from "@/server/audit";
import type { Db } from "@/server/db";
import {
  contentJobs,
  creativeRenders,
  creatives,
  listingTexts,
  pkrs,
  products,
} from "@/server/db/schema";
import { withOrg } from "@/server/db/with-org";
import {
  ConflictError,
  NotFoundError,
  TransientError,
  ValidationError,
} from "@/server/errors";
import { enqueueContent } from "@/server/jobs/content-client";
import { assertTransition } from "@/server/products/product-status";
import { type Actor, loadProductRow } from "@/server/products/service";
import { createDownloadUrl } from "@/server/storage";
import {
  assertDurationSupported,
  centsPerSecond,
  getVideoModelRules,
} from "@/server/video/duration-rules";
import { checkFfmpeg } from "@/server/video/post-process";
import { TEXT_IMAGE_CALL_CEILING_MINOR } from "./budget";
import { estimateMinor } from "./cost";
import { createDownloadUrlPath } from "./download-path";
import { VIDEO_RESOLUTION } from "./stages/videos";

// Calls per run, for the estimate. Text: PKR, listing, ad copy. Images: a brief and
// an image per slot (main white is free). Videos: one storyboard per video, plus
// the PKR when none exists yet.
function textCalls(): number {
  return 3;
}
function imageCalls(slotCount: number): number {
  // One image call per slot. Prompts are fixed, so there is no brief call.
  return slotCount;
}
function videoCalls(videoCount: number): number {
  return 1 + videoCount;
}

export function resolveCap(productCapMinor: number | null): number | null {
  if (productCapMinor !== null) return productCapMinor;
  return getAiEnv().AI_DEFAULT_SPEND_CAP_MINOR ?? null;
}

export function estimateRun(input: {
  scope: ContentScope;
  videoCount: number;
  videoDurationSeconds: number;
  slotCount: number;
  capMinor: number | null;
  currency?: string;
}): ContentEstimate {
  const env = getAiEnv();
  let videosMinor = 0;
  let calls = 0;
  if (input.scope === "text") {
    calls = textCalls();
  } else if (input.scope === "images") {
    calls = imageCalls(input.slotCount);
  } else {
    const rules = getVideoModelRules(env.AI_VIDEO_MODEL_ID);
    assertDurationSupported(
      rules,
      input.videoDurationSeconds,
      VIDEO_LIMITS.minSeconds,
      VIDEO_LIMITS.maxSeconds,
    );
    videosMinor =
      input.videoCount *
      estimateMinor(
        input.videoDurationSeconds,
        centsPerSecond(rules, VIDEO_RESOLUTION),
      );
    calls = videoCalls(input.videoCount);
  }
  const aiCallsMinor = estimateMinor(calls, TEXT_IMAGE_CALL_CEILING_MINOR);
  const estimatedMinor = videosMinor + aiCallsMinor;
  return {
    currency: input.currency ?? "USD",
    videosMinor,
    aiCallsMinor,
    estimatedMinor,
    capMinor: input.capMinor,
    overCap: input.capMinor !== null && estimatedMinor > input.capMinor,
    videoModelId: env.AI_VIDEO_MODEL_ID,
    textModelId: env.AI_TEXT_MODEL_ID,
    imageModelId: env.AI_IMAGE_MODEL_ID,
  };
}

export async function getEstimate(
  db: Db,
  actor: Actor,
  productId: string,
  input: {
    scope: ContentScope;
    videoCount: number;
    videoDurationSeconds: number;
    slotCount: number;
  },
): Promise<ContentEstimate> {
  const product = await loadProductRow(db, actor, productId);
  return estimateRun({ ...input, capMinor: resolveCap(product.spendCapMinor) });
}

// Options stored on the job, so a retry runs exactly the same work.
function optionsFor(input: StartContentInput): JobOptions {
  if (input.scope === "videos") {
    return {
      videoCount: input.videoCount,
      videoDurationSeconds: input.videoDurationSeconds,
    };
  }
  if (input.scope === "images") {
    return { slots: input.slots ?? [...RUNNABLE_SLOTS] };
  }
  return {};
}

// Starts one run (text, images or videos). Checks run before anything is written.
export async function startContentJob(
  db: Db,
  actor: Actor,
  productId: string,
  idempotencyKey: string,
  input: StartContentInput,
): Promise<{ jobId: string; created: boolean }> {
  const env = getAiEnv();
  if (input.scope === "videos") {
    await checkFfmpeg(env.FFMPEG_PATH);
  }

  const [existing] = await db
    .select({ id: contentJobs.id })
    .from(contentJobs)
    .where(
      and(
        withOrg(contentJobs, actor.orgId),
        eq(contentJobs.idempotencyKey, idempotencyKey),
      ),
    )
    .limit(1);
  if (existing) return { jobId: existing.id, created: false };

  const product = await loadProductRow(db, actor, productId);
  assertTransition(product.status as ProductStatus, "processing");
  if (!product.ingestedAt) {
    throw new ValidationError(
      "Finish the upload and ingest before generating content",
    );
  }
  const capMinor = resolveCap(product.spendCapMinor);
  if (capMinor === null) {
    throw new ValidationError("Set a spend cap before generating");
  }
  const options = optionsFor(input);
  const estimate = estimateRun({
    scope: input.scope,
    videoCount: input.videoCount,
    videoDurationSeconds: input.videoDurationSeconds,
    slotCount: options.slots?.length ?? RUNNABLE_SLOTS.length,
    capMinor,
  });
  if (estimate.overCap) {
    throw new ValidationError(
      "The estimated cost is over the spend cap. Raise the cap or choose less work.",
    );
  }

  const jobId = v7();
  try {
    await db.transaction(async (tx) => {
      await tx.insert(contentJobs).values({
        id: jobId,
        orgId: actor.orgId,
        productId,
        attemptGroup: v7(),
        status: "queued",
        steps: [],
        scope: input.scope,
        options,
        capMinor,
        spentMinor: 0,
        currency: "USD",
        idempotencyKey,
      });
      await tx
        .update(products)
        .set({ status: "processing" })
        .where(and(withOrg(products, actor.orgId), eq(products.id, productId)));
      await recordAuditEvent(tx, {
        orgId: actor.orgId,
        actorId: actor.userId,
        action: "content.started",
        entityType: "product",
        entityId: productId,
        metadata: {
          jobId,
          scope: input.scope,
          capMinor,
          estimatedMinor: estimate.estimatedMinor,
        },
      });
    });
  } catch (error) {
    // The partial unique index allows one active job per product.
    if (isUniqueViolation(error)) {
      throw new ConflictError(
        "A content run is already in progress for this product",
      );
    }
    throw error;
  }

  try {
    await enqueueContent({
      orgId: actor.orgId,
      productId,
      jobId,
      actorId: actor.userId,
      scope: input.scope,
      videoCount: input.videoCount,
      videoDurationSeconds: input.videoDurationSeconds,
      slots: options.slots,
    });
  } catch {
    await db
      .update(contentJobs)
      .set({
        status: "failed",
        errorCode: "TRANSIENT",
        errorMessage: "Could not start the background job",
      })
      .where(and(withOrg(contentJobs, actor.orgId), eq(contentJobs.id, jobId)));
    throw new TransientError("Could not start the background job. Try again.");
  }
  return { jobId, created: true };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

type JobRow = typeof contentJobs.$inferSelect;

export function toJobView(row: JobRow): JobView {
  return {
    id: row.id,
    scope: row.scope,
    status: row.status,
    options: row.options as JobOptions,
    capMinor: row.capMinor,
    spentMinor: row.spentMinor,
    currency: row.currency,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    steps: row.steps as JobView["steps"],
    updatedAt: row.updatedAt,
  };
}

// The newest job for each scope. Older runs stay in the database.
export async function getLatestJobs(db: Db, actor: Actor, productId: string) {
  const product = await loadProductRow(db, actor, productId);
  const rows = await db
    .select()
    .from(contentJobs)
    .where(
      and(
        withOrg(contentJobs, actor.orgId),
        eq(contentJobs.productId, productId),
      ),
    )
    .orderBy(desc(contentJobs.createdAt))
    .limit(60);
  const byScope = { text: null, images: null, videos: null } as Record<
    "text" | "images" | "videos",
    JobView | null
  >;
  for (const row of rows) {
    if (row.scope in byScope && byScope[row.scope as "text"] === null) {
      byScope[row.scope as "text"] = toJobView(row);
    }
  }
  const newest = rows[0];
  return {
    jobsByScope: byScope,
    latest: newest ? toJobView(newest) : null,
    productStatus: product.status,
  };
}

// Everything the content screen shows. Only the newest version of each slot is
// returned; older versions stay in the database.
export async function getContentOutputs(
  db: Db,
  actor: Actor,
  productId: string,
): Promise<ContentOutputs> {
  const { jobsByScope, productStatus } = await getLatestJobs(
    db,
    actor,
    productId,
  );

  const [pkrRow] = await db
    .select()
    .from(pkrs)
    .where(and(withOrg(pkrs, actor.orgId), eq(pkrs.productId, productId)))
    .orderBy(desc(pkrs.version))
    .limit(1);

  const creativeRows = await db
    .select()
    .from(creatives)
    .where(
      and(withOrg(creatives, actor.orgId), eq(creatives.productId, productId)),
    )
    .orderBy(desc(creatives.version));
  const latestBySlot = new Map<string, (typeof creativeRows)[number]>();
  for (const row of creativeRows) {
    const key = `${row.kind}:${row.slot}`;
    if (!latestBySlot.has(key)) latestBySlot.set(key, row);
  }
  const latest = [...latestBySlot.values()];
  const renderRows =
    latest.length === 0
      ? []
      : await db
          .select()
          .from(creativeRenders)
          .where(
            and(
              withOrg(creativeRenders, actor.orgId),
              inArray(
                creativeRenders.creativeId,
                latest.map((c) => c.id),
              ),
            ),
          );

  const listingRows = await db
    .select()
    .from(listingTexts)
    .where(
      and(
        withOrg(listingTexts, actor.orgId),
        eq(listingTexts.productId, productId),
      ),
    )
    .orderBy(desc(listingTexts.version));
  const latestListing = new Map<string, (typeof listingRows)[number]>();
  for (const row of listingRows) {
    if (!latestListing.has(row.target)) latestListing.set(row.target, row);
  }

  return {
    productStatus,
    jobsByScope,
    pkr: pkrRow
      ? { version: pkrRow.version, body: pkrRow.body, modelId: pkrRow.modelId }
      : null,
    creatives: latest.map((c) => ({
      id: c.id,
      kind: c.kind,
      slot: c.slot,
      version: c.version,
      status: c.status,
      modelId: c.modelId,
      durationSeconds: c.durationSeconds,
      providerStatus: c.providerStatus,
      costMinor: c.costMinor,
      errorMessage: c.errorMessage,
      policyFindings: c.policyFindings as unknown[],
      renders: renderRows
        .filter((r) => r.creativeId === c.id)
        .map((r) => ({
          id: r.id,
          variant: r.variant,
          mediaType: r.mediaType,
          width: r.width,
          height: r.height,
          downloadPath: createDownloadUrlPath(r.id),
        })),
    })),
    listings: [...latestListing.values()].map((l) => ({
      id: l.id,
      target: l.target,
      version: l.version,
      status: l.status,
      body: l.body,
      policyFindings: l.policyFindings as unknown[],
    })),
  };
}

// Owner only (CLAUDE.md §7.5). Raising the cap is an explicit owner action.
export async function setSpendCap(
  db: Db,
  actor: Actor & { role: string },
  productId: string,
  capMinor: number,
  currency: string,
): Promise<void> {
  if (actor.role !== "owner") {
    throw new ConflictError("Only an owner can change the spend cap");
  }
  const product = await loadProductRow(db, actor, productId);
  await db.transaction(async (tx) => {
    await tx
      .update(products)
      .set({ spendCapMinor: capMinor })
      .where(and(withOrg(products, actor.orgId), eq(products.id, productId)));
    await recordAuditEvent(tx, {
      orgId: actor.orgId,
      actorId: actor.userId,
      action: "spend_cap.changed",
      entityType: "product",
      entityId: productId,
      metadata: {
        previousMinor: product.spendCapMinor,
        newMinor: capMinor,
        currency,
      },
    });
  });
}

// Redirect target for a render. The signed URL is created per request and never
// stored. With download set, the file is saved under a readable name such as
// "lifestyle-4x5.jpg".
export async function renderDownloadUrl(
  db: Db,
  actor: Actor,
  renderId: string,
  download: boolean,
): Promise<string> {
  const [row] = await db
    .select({
      storageKey: creativeRenders.storageKey,
      variant: creativeRenders.variant,
      mediaType: creativeRenders.mediaType,
      slot: creatives.slot,
    })
    .from(creativeRenders)
    .innerJoin(creatives, eq(creatives.id, creativeRenders.creativeId))
    .where(
      and(
        withOrg(creativeRenders, actor.orgId),
        eq(creativeRenders.id, renderId),
      ),
    )
    .limit(1);
  if (!row) throw new NotFoundError("File not found");
  if (!download) return createDownloadUrl(row.storageKey);
  const ext = row.mediaType === "video/mp4" ? "mp4" : "jpg";
  const filename = `${row.slot}-${row.variant.replace(":", "x")}.${ext}`;
  return createDownloadUrl(row.storageKey, { filename });
}
