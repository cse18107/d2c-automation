import "server-only";
import type { VideoStoryboard } from "@/schemas/video";

// Builds the scene prompt for the video model from a validated storyboard. Pure,
// so the exact text sent to the provider can be tested. The product photo is sent
// separately as the first frame (ADR 0004).
export function buildVideoPrompt(input: {
  storyboard: VideoStoryboard;
  productName: string;
  durationSeconds: number;
  withSound?: boolean;
}): string {
  const scenes = input.storyboard.scenes
    .map((scene, i) => `Scene ${i + 1}: ${scene.description}`)
    .join("\n");
  return [
    `Short vertical 9:16 product video of "${input.productName}", about ${input.durationSeconds} seconds.`,
    "Start from the product photo provided as the first frame and keep the product exactly as shown: same shape, colour and label.",
    "Keep the product centred and fully visible in every scene.",
    scenes,
    "No people or faces. No on-screen text other than the scene captions. No logos or brands other than the product.",
    ...(input.withSound
      ? [
          "Add a soundtrack that matches each scene: product sounds and ambient audio, with subtle music. No speech or voice-over.",
        ]
      : []),
  ].join("\n");
}

export function captionsOf(storyboard: VideoStoryboard): string[] {
  return storyboard.scenes.map((scene) => scene.caption);
}
