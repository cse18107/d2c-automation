import { z } from "zod";
import { VIDEO_LIMITS } from "./limits";

// Storyboard for one video: three scenes of the product in everyday use. Every
// line must use PKR facts only (spec §8). Validated before any paid call.
export const videoStoryboardSchema = z.object({
  scenes: z
    .array(
      z.object({
        description: z.string().min(1).max(VIDEO_LIMITS.sceneMax),
        caption: z.string().min(1).max(VIDEO_LIMITS.captionMax),
      }),
    )
    .length(VIDEO_LIMITS.sceneCount),
  endCardText: z.string().min(1).max(VIDEO_LIMITS.endCardMax),
});
export type VideoStoryboard = z.infer<typeof videoStoryboardSchema>;

export const videoJobStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
  "expired",
  "rejected",
]);
export type VideoJobStatus = z.infer<typeof videoJobStatusSchema>;

export const videoEstimateInputSchema = z.object({
  count: z
    .number()
    .int()
    .min(VIDEO_LIMITS.videosPerProductMin)
    .max(VIDEO_LIMITS.videosPerProductMax),
  durationSeconds: z
    .number()
    .int()
    .min(VIDEO_LIMITS.minSeconds)
    .max(VIDEO_LIMITS.maxSeconds),
  model: z.string().min(1).max(200).optional(),
});
export type VideoEstimateInput = z.infer<typeof videoEstimateInputSchema>;
