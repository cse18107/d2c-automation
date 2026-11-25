import { z } from "zod";

// One image brief from the text model: the prompt for the image model and an
// optional short overlay line. The overlay is checked by policy before use.
export const creativeBriefSchema = z.object({
  prompt: z.string().min(40).max(1200),
  overlayText: z.string().max(60).nullable(),
});
export type CreativeBrief = z.infer<typeof creativeBriefSchema>;

// The four AI-generated image slots. Each has its own fixed prompt in
// src/server/ai/prompts/image-slots.v1.md. The white-background main image is made
// separately with sharp (no model).
export const IMAGE_SLOTS = [
  "lifestyle",
  "flat_lay",
  "ugc",
  "close_up",
] as const;
export type ImageSlot = (typeof IMAGE_SLOTS)[number];
