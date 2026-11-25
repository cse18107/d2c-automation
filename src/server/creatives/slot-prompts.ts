import "server-only";
import type { ImageSlot } from "@/schemas/creative";
import { IMAGE_PROMPT_IDS, loadPrompt } from "@/server/ai/prompts";

// The fixed prompt for one image slot. Each slot has its own file in
// src/server/ai/prompts/ (image-<slot>.v<N>.md), so its wording and version are
// tracked separately.
export async function getSlotPrompt(slot: ImageSlot): Promise<{
  prompt: string;
  promptVersion: string;
}> {
  const promptVersion = IMAGE_PROMPT_IDS[slot];
  const prompt = (await loadPrompt(promptVersion)).trim();
  return { prompt, promptVersion };
}
