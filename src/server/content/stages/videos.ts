import "server-only";
import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import type { Json } from "@/schemas/json";
import { VIDEO_LIMITS } from "@/schemas/limits";
import type { PkrBody } from "@/schemas/pkr";
import { type VideoStoryboard, videoStoryboardSchema } from "@/schemas/video";
import { videoStoryboardJsonSchema } from "@/server/ai/json-schemas";
import { loadPrompt, PROMPT_IDS } from "@/server/ai/prompts";
import { callStructured } from "@/server/ai/structured";
import { creativeRenders, creatives } from "@/server/db/schema";
import { withOrg } from "@/server/db/with-org";
import { AppError, PermanentError, ValidationError } from "@/server/errors";
import {
  assertDurationSupported,
  centsPerSecond,
  getVideoModelRules,
} from "@/server/video/duration-rules";
import { postProcessVideo } from "@/server/video/post-process";
import { buildVideoPrompt, captionsOf } from "@/server/video/storyboard";
import { TEXT_IMAGE_CALL_CEILING_MINOR } from "../budget";
import { estimateMinor } from "../cost";
import {
  paidCall,
  reserveVideoSpend,
  type StageContext,
  settleVideoSpend,
} from "./context";
import type { PhotoRef } from "./load";
import { type NewRender, renderKey, saveCreative, sha256Hex } from "./persist";

// 720p at 9:16 is the default (ADR 0004). Changing it changes the price table.
export const VIDEO_RESOLUTION = "720p";
const FIDELITY_UNCHECKED = [
  {
    ruleId: "fidelity_unchecked",
    severity: "warn",
    message: "The product fidelity check has not run on this video",
  },
] as const;

export type VideoSubmitInput = {
  pkr: PkrBody;
  photo: PhotoRef;
  productName: string;
  durationSeconds: number;
  videoNumber: number;
};

// Submits one video. Called once per Inngest step, so a retry never resubmits a
// video that already has a provider job id. Returns the creative id.
export async function submitVideoStage(
  ctx: StageContext,
  input: VideoSubmitInput,
): Promise<string> {
  const rules = getVideoModelRules(ctx.models.video);
  assertDurationSupported(
    rules,
    input.durationSeconds,
    VIDEO_LIMITS.minSeconds,
    VIDEO_LIMITS.maxSeconds,
  );
  const estimate = estimateMinor(
    input.durationSeconds,
    centsPerSecond(rules, VIDEO_RESOLUTION),
  );

  const storyboardSystem = await loadPrompt(PROMPT_IDS.videoStoryboard);
  const storyboardModel = ctx.models.text;
  const storyboard = await paidCall(ctx, {
    purpose: "video_storyboard",
    promptVersion: PROMPT_IDS.videoStoryboard,
    modelId: storyboardModel,
    ceilingMinor: TEXT_IMAGE_CALL_CEILING_MINOR,
    run: async () => {
      const result = await callStructured(ctx.ai, {
        modelId: storyboardModel,
        system: storyboardSystem,
        user: `Duration: ${input.durationSeconds} seconds\nPKR:\n${JSON.stringify(input.pkr)}`,
        schemaName: "video_storyboard",
        jsonSchema: videoStoryboardJsonSchema,
        parse: videoStoryboardSchema,
      });
      return { value: result.value, costMinor: result.costMinor };
    },
  });

  const prompt = buildVideoPrompt({
    storyboard: storyboard.value,
    productName: input.productName,
    durationSeconds: input.durationSeconds,
  });
  const firstFrameUrl = await prepareFirstFrame(ctx, input.photo);

  await reserveVideoSpend(ctx, estimate);
  let submitted: Awaited<ReturnType<typeof ctx.ai.submitVideo>>;
  try {
    submitted = await ctx.ai.submitVideo({
      modelId: ctx.models.video,
      prompt,
      firstFrameUrl,
      durationSeconds: input.durationSeconds,
      resolution: VIDEO_RESOLUTION,
      aspectRatio: "9:16",
    });
  } catch (error) {
    // Nothing was created at the provider, so the held estimate is released.
    await settleVideoSpend(ctx, estimate, 0);
    throw error;
  }

  return saveCreative(
    ctx,
    {
      slot: `video-${input.videoNumber}`,
      kind: "video",
      status: "running",
      modelId: ctx.models.video,
      promptVersion: PROMPT_IDS.videoStoryboard,
      inputHash: sha256Hex(new TextEncoder().encode(prompt)),
      costMinor: estimate,
      durationSeconds: input.durationSeconds,
      providerJobId: submitted.providerJobId,
      providerStatus: submitted.status,
      storyboard: storyboard.value as unknown as Json,
      policyFindings: [...FIDELITY_UNCHECKED],
    },
    [],
  );
}

// The video provider fetches a reference URL itself, so a localhost storage URL
// is rejected. The first frame is therefore sent inline as a base64 JPEG (long side
// at most 1280 px). The stored photo is not changed. ADR 0004.
async function prepareFirstFrame(
  ctx: StageContext,
  photo: PhotoRef,
): Promise<string> {
  const source = await ctx.storage.readObject(photo.key);
  const jpeg = await sharp(source)
    .rotate()
    .resize({
      width: 1280,
      height: 1280,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 92 })
    .toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
}

export type PollOutcome = { done: boolean; status: string };

// Checks one submitted video. Returns done=false while the provider is still
// working. Finishing (download, post-process, store) happens here once the
// provider reports completion. The row is updated only from `running`, so a
// second poll cannot finish it twice.
export async function pollVideoStage(
  ctx: StageContext,
  creativeId: string,
): Promise<PollOutcome> {
  const { orgId } = ctx.scope;
  const [row] = await ctx.db
    .select()
    .from(creatives)
    .where(and(withOrg(creatives, orgId), eq(creatives.id, creativeId)))
    .limit(1);
  if (!row || row.kind !== "video")
    throw new ValidationError("Video not found");
  if (row.status !== "running" || row.providerJobId === null) {
    return { done: true, status: row.status };
  }
  const estimate = row.costMinor;
  const polled = await ctx.ai.pollVideo(row.providerJobId);
  await ctx.db
    .update(creatives)
    .set({ providerStatus: polled.status })
    .where(and(withOrg(creatives, orgId), eq(creatives.id, creativeId)));

  if (polled.status === "pending" || polled.status === "running") {
    return { done: false, status: polled.status };
  }

  if (polled.status === "completed") {
    return finishCompleted(ctx, {
      id: creativeId,
      row,
      estimate,
      downloadUrl: polled.downloadUrl,
      actualMinor: polled.costMinor,
    });
  }

  // failed, cancelled and expired end here. A failed job may still be charged
  // (the confirmation dialog says so), so the reported cost is kept when present.
  const status = polled.status === "expired" ? "expired" : "failed";
  const charged = await settleVideoSpend(ctx, estimate, polled.costMinor);
  await markRunning(ctx, creativeId, {
    status,
    costMinor: charged,
    errorMessage: polled.errorMessage ?? `Provider status: ${polled.status}`,
  });
  return { done: true, status };
}

async function markRunning(
  ctx: StageContext,
  id: string,
  patch: {
    status: "failed" | "expired";
    costMinor: number;
    errorMessage: string | null;
  },
): Promise<void> {
  await ctx.db
    .update(creatives)
    .set({
      status: patch.status,
      costMinor: patch.costMinor,
      errorMessage: patch.errorMessage,
    })
    .where(
      and(
        withOrg(creatives, ctx.scope.orgId),
        eq(creatives.id, id),
        eq(creatives.status, "running"),
      ),
    );
}

async function finishCompleted(
  ctx: StageContext,
  input: {
    id: string;
    row: typeof creatives.$inferSelect;
    estimate: number;
    downloadUrl: string | null;
    actualMinor: number | null;
  },
): Promise<PollOutcome> {
  const { orgId, productId } = ctx.scope;
  if (input.downloadUrl === null) {
    throw new PermanentError("The provider finished without a download URL");
  }

  let bytes: Uint8Array;
  try {
    bytes = await ctx.ai.downloadVideo(input.downloadUrl);
  } catch (error) {
    // OpenRouter's copy expired before we could download it (ADR 0004).
    if (error instanceof PermanentError) {
      const charged = await settleVideoSpend(
        ctx,
        input.estimate,
        input.actualMinor,
      );
      await markRunning(ctx, input.id, {
        status: "expired",
        costMinor: charged,
        errorMessage: error.message,
      });
      return { done: true, status: "expired" };
    }
    throw error;
  }

  const storyboard = input.row.storyboard as unknown as VideoStoryboard;
  let processed: Awaited<ReturnType<typeof postProcessVideo>>;
  try {
    processed = await postProcessVideo({
      ffmpegPath: ctx.ffmpegPath,
      fontFile: ctx.fontFile,
      master: bytes,
      captions: captionsOf(storyboard),
      durationSeconds: input.row.durationSeconds ?? 8,
    });
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    const charged = await settleVideoSpend(
      ctx,
      input.estimate,
      input.actualMinor,
    );
    await markRunning(ctx, input.id, {
      status: "failed",
      costMinor: charged,
      errorMessage: error.message,
    });
    return { done: true, status: "failed" };
  }

  const variants: { variant: string; bytes: Uint8Array }[] = [
    { variant: "9:16", bytes: processed.master },
    { variant: "1:1", bytes: processed.square },
    { variant: "16:9", bytes: processed.landscape },
  ];
  const renders: NewRender[] = [];
  for (const v of variants) {
    const key = renderKey(orgId, productId, input.id, v.variant, "video/mp4");
    await ctx.storage.writeObject(key, v.bytes, "video/mp4");
    renders.push({
      variant: v.variant,
      bytes: v.bytes,
      mediaType: "video/mp4",
      width: null,
      height: null,
    });
  }

  const charged = await settleVideoSpend(
    ctx,
    input.estimate,
    input.actualMinor,
  );
  await ctx.db.transaction(async (tx) => {
    const updated = await tx
      .update(creatives)
      .set({ status: "pending_review", costMinor: charged })
      .where(and(eq(creatives.id, input.id), eq(creatives.status, "running")))
      .returning({ id: creatives.id });
    if (updated.length === 0) return;
    for (const render of renders) {
      await tx.insert(creativeRenders).values({
        orgId,
        creativeId: input.id,
        variant: render.variant,
        storageKey: renderKey(
          orgId,
          productId,
          input.id,
          render.variant,
          "video/mp4",
        ),
        mediaType: "video/mp4",
        bytes: render.bytes.byteLength,
        sha256: sha256Hex(render.bytes),
        aiGenerated: true,
      });
    }
  });
  return { done: true, status: "pending_review" };
}

// Used when polling runs out of rounds. Marks the video failed so it is not left
// in `running` forever.
export async function timeOutVideo(
  ctx: StageContext,
  creativeId: string,
): Promise<void> {
  const [row] = await ctx.db
    .select({ costMinor: creatives.costMinor })
    .from(creatives)
    .where(
      and(withOrg(creatives, ctx.scope.orgId), eq(creatives.id, creativeId)),
    )
    .limit(1);
  if (!row) return;
  const charged = await settleVideoSpend(ctx, row.costMinor, null);
  await markRunning(ctx, creativeId, {
    status: "failed",
    costMinor: charged,
    errorMessage: "The video provider did not finish in time",
  });
}
