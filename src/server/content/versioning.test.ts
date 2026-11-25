import { describe, expect, it } from "vitest";
import { latestPerSlot, nextVersion } from "./versioning";

describe("nextVersion", () => {
  it("starts at 1", () => {
    expect(nextVersion([])).toBe(1);
  });

  it("is one more than the highest existing version", () => {
    expect(nextVersion([1, 3, 2])).toBe(4);
  });
});

describe("latestPerSlot", () => {
  it("keeps only the newest version of each slot", () => {
    const rows = [
      { slot: "lifestyle", version: 1 },
      { slot: "lifestyle", version: 2 },
      { slot: "flat_lay", version: 1 },
    ];
    const latest = latestPerSlot(rows);
    expect(latest.get("lifestyle")?.version).toBe(2);
    expect(latest.get("flat_lay")?.version).toBe(1);
    expect(latest.size).toBe(2);
  });

  it("does not mutate the input rows", () => {
    const rows = [
      { slot: "ugc", version: 2 },
      { slot: "ugc", version: 1 },
    ];
    latestPerSlot(rows);
    expect(rows).toEqual([
      { slot: "ugc", version: 2 },
      { slot: "ugc", version: 1 },
    ]);
  });
});
