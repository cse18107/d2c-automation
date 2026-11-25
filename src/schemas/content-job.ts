import { z } from "zod";
import { IMAGE_SLOTS } from "./creative";
import { VIDEO_LIMITS } from "./limits";
import { spendCapInputSchema } from "./money";

// The three runs the content screen starts separately (text, images, videos).
// "all" is only used by rows created before scopes existed.
export const CONTENT_SCOPES = ["text", "images", "videos"] as const;
export const contentScopeSchema = z.enum(CONTENT_SCOPES);
export type ContentScope = z.infer<typeof contentScopeSchema>;

export const RUNNABLE_SLOTS = [...IMAGE_SLOTS, "main_white"] as const;
export const runnableSlotSchema = z.enum(RUNNABLE_SLOTS);

export const jobOptionsSchema = z.object({
  videoCount: z.number().int().optional(),
  videoDurationSeconds: z.number().int().optional(),
  slots: z.array(runnableSlotSchema).optional(),
});
export type JobOptions = z.infer<typeof jobOptionsSchema>;

// Start a run. The user confirms the cost first (CLAUDE.md §7.5, §8).
export const startContentInputSchema = z.object({
  costConfirmed: z.literal(true),
  scope: contentScopeSchema,
  videoCount: z
    .number()
    .int()
    .min(VIDEO_LIMITS.videosPerProductMin)
    .max(VIDEO_LIMITS.videosPerProductMax)
    .default(2),
  videoDurationSeconds: z
    .number()
    .int()
    .min(VIDEO_LIMITS.minSeconds)
    .max(VIDEO_LIMITS.maxSeconds)
    .default(8),
  // Image slots to (re)generate. Omitted means all of them.
  slots: z
    .array(runnableSlotSchema)
    .min(1)
    .max(RUNNABLE_SLOTS.length)
    .optional(),
});
export type StartContentInput = z.infer<typeof startContentInputSchema>;

export const contentEstimateQuerySchema = z.object({
  scope: contentScopeSchema,
  videoCount: z.coerce
    .number()
    .int()
    .min(VIDEO_LIMITS.videosPerProductMin)
    .max(VIDEO_LIMITS.videosPerProductMax)
    .default(2),
  videoDurationSeconds: z.coerce
    .number()
    .int()
    .min(VIDEO_LIMITS.minSeconds)
    .max(VIDEO_LIMITS.maxSeconds)
    .default(8),
  slotCount: z.coerce
    .number()
    .int()
    .min(1)
    .max(RUNNABLE_SLOTS.length)
    .default(RUNNABLE_SLOTS.length),
});

export const contentEstimateResponseSchema = z.object({
  currency: z.string(),
  videosMinor: z.number().int().nonnegative(),
  aiCallsMinor: z.number().int().nonnegative(),
  estimatedMinor: z.number().int().nonnegative(),
  capMinor: z.number().int().positive().nullable(),
  overCap: z.boolean(),
  videoModelId: z.string(),
  textModelId: z.string(),
  imageModelId: z.string(),
});
export type ContentEstimate = z.infer<typeof contentEstimateResponseSchema>;

const stepSchema = z.object({
  name: z.string(),
  status: z.enum(["running", "succeeded", "failed"]),
  error: z.string().nullable(),
  at: z.string(),
});

export const jobViewSchema = z.object({
  id: z.uuid(),
  scope: z.string(),
  status: z.enum(["queued", "running", "succeeded", "failed", "cancelled"]),
  options: jobOptionsSchema,
  capMinor: z.number().int().nullable(),
  spentMinor: z.number().int().nonnegative(),
  currency: z.string(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  steps: z.array(stepSchema),
  updatedAt: z.string(),
});
export type JobView = z.infer<typeof jobViewSchema>;

export const contentJobResponseSchema = z.object({
  job: jobViewSchema.nullable(),
  productStatus: z.string(),
});
export type ContentJobResponse = z.infer<typeof contentJobResponseSchema>;

const renderSchema = z.object({
  id: z.uuid(),
  variant: z.string(),
  mediaType: z.string(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  // Path to the redirect route. Signed URLs are never stored or listed.
  downloadPath: z.string(),
});

const creativeOutputSchema = z.object({
  id: z.uuid(),
  kind: z.enum(["image", "video"]),
  slot: z.string(),
  version: z.number().int(),
  status: z.string(),
  modelId: z.string(),
  durationSeconds: z.number().int().nullable(),
  providerStatus: z.string().nullable(),
  costMinor: z.number().int(),
  errorMessage: z.string().nullable(),
  policyFindings: z.array(z.unknown()),
  renders: z.array(renderSchema),
});

export const contentOutputsResponseSchema = z.object({
  productStatus: z.string(),
  // The latest run for each scope, so each section can show its own status and retry.
  jobsByScope: z.object({
    text: jobViewSchema.nullable(),
    images: jobViewSchema.nullable(),
    videos: jobViewSchema.nullable(),
  }),
  pkr: z
    .object({
      version: z.number().int(),
      body: z.unknown(),
      modelId: z.string(),
    })
    .nullable(),
  creatives: z.array(creativeOutputSchema),
  listings: z.array(
    z.object({
      id: z.uuid(),
      target: z.enum(["marketplace", "ad_copy"]),
      version: z.number().int(),
      status: z.string(),
      body: z.unknown(),
      policyFindings: z.array(z.unknown()),
    }),
  ),
});
export type ContentOutputs = z.infer<typeof contentOutputsResponseSchema>;

export const spendCapResponseSchema = spendCapInputSchema;
