import { describe, expect, it } from "vitest";
import { buildVideoPrompt, captionsOf } from "./storyboard";

const storyboard = {
  scenes: [
    { description: "Gel on a bathroom shelf", caption: "Lightweight" },
    { description: "Hand applies a thin layer", caption: "No white cast" },
    { description: "Product closes in the cabinet", caption: "SPF 50" },
  ],
  endCardText: "Aqua gel",
};

describe("buildVideoPrompt", () => {
  it("starts from the photo and keeps the product whole and centred", () => {
    const prompt = buildVideoPrompt({
      storyboard,
      productName: "Aqua Gel",
      durationSeconds: 8,
    });
    expect(prompt).toContain("first frame");
    expect(prompt).toContain("centred and fully visible");
    expect(prompt).toContain("about 8 seconds");
  });

  it("lists the three scenes in order", () => {
    const prompt = buildVideoPrompt({
      storyboard,
      productName: "Aqua Gel",
      durationSeconds: 8,
    });
    const first = prompt.indexOf("Scene 1: Gel on a bathroom shelf");
    const third = prompt.indexOf("Scene 3: Product closes in the cabinet");
    expect(first).toBeGreaterThan(-1);
    expect(third).toBeGreaterThan(first);
  });

  it("forbids people and on-screen text other than captions", () => {
    const prompt = buildVideoPrompt({
      storyboard,
      productName: "Aqua Gel",
      durationSeconds: 8,
    });
    expect(prompt).toContain("No people or faces");
    expect(prompt).toContain("No on-screen text other than the scene captions");
  });
});

describe("captionsOf", () => {
  it("returns one caption per scene in order", () => {
    expect(captionsOf(storyboard)).toEqual([
      "Lightweight",
      "No white cast",
      "SPF 50",
    ]);
  });
});
