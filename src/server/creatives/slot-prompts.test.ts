import { describe, expect, it } from "vitest";
import { IMAGE_SLOTS } from "@/schemas/creative";
import { getSlotPrompt } from "./slot-prompts";

describe("getSlotPrompt", () => {
  it.each(IMAGE_SLOTS)("loads its own versioned file for %s", async (slot) => {
    const { prompt, promptVersion } = await getSlotPrompt(slot);
    expect(prompt.length).toBeGreaterThan(50);
    expect(promptVersion).toMatch(/^image-[a-z-]+\.v\d+$/);
  });

  it("gives each slot a different prompt", async () => {
    const texts = await Promise.all(
      IMAGE_SLOTS.map((s) => getSlotPrompt(s).then((r) => r.prompt)),
    );
    expect(new Set(texts).size).toBe(IMAGE_SLOTS.length);
  });
});
