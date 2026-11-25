import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ValidationError } from "@/server/errors";

// Prompts are versioned files (CLAUDE.md §8). `id` is "<name>.v<N>", for
// example "pkr-extract.v1", and maps to "<name>.v<N>.md" in this folder. No
// inline prompt strings in app code.
const PROMPT_ID = /^[a-z][a-z0-9-]*\.v[1-9][0-9]*$/;
const cache = new Map<string, string>();

export const PROMPT_IDS = {
  pkrExtract: "pkr-extract.v1",
  creativeBrief: "creative-brief.v1",
  listingText: "listing-text.v1",
  adCopy: "ad-copy.v1",
  videoStoryboard: "video-storyboard.v1",
} as const;

// One fixed prompt file per generated image slot (CLAUDE.md §8 versioned prompts).
export const IMAGE_PROMPT_IDS = {
  lifestyle: "image-lifestyle.v1",
  flat_lay: "image-flat-lay.v1",
  ugc: "image-ugc.v1",
  close_up: "image-close-up.v1",
} as const;

export async function loadPrompt(id: string): Promise<string> {
  if (!PROMPT_ID.test(id)) {
    throw new ValidationError(`Invalid prompt id: ${id}`);
  }
  const cached = cache.get(id);
  if (cached !== undefined) return cached;
  // The app runs from the project root (`next dev`, `next start`), so the
  // prompt folder is resolved from there.
  const text = await readFile(
    join(process.cwd(), "src", "server", "ai", "prompts", `${id}.md`),
    "utf8",
  );
  cache.set(id, text);
  return text;
}
