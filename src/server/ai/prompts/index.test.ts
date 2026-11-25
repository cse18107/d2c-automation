import { describe, expect, it } from "vitest";
import { ValidationError } from "@/server/errors";
import { loadPrompt, PROMPT_IDS } from "./index";

describe("loadPrompt", () => {
  it.each(
    Object.values(PROMPT_IDS),
  )("loads the versioned file for %s", async (id) => {
    const text = await loadPrompt(id);
    expect(text.length).toBeGreaterThan(50);
    expect(text.trim().length).toBeGreaterThan(0);
  });

  it("rejects an id that is not name.vN (no path tricks)", async () => {
    await expect(loadPrompt("../../etc/passwd")).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(loadPrompt("pkr-extract")).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});
