import { describe, expect, it } from "vitest";
import type { PkrBody } from "@/schemas/pkr";
import { composeImagePrompt } from "./creatives";

const pkr: PkrBody = {
  name: "Aqua Gel SPF 50",
  features: ["Lightweight gel"],
  specs: [{ label: "Volume", value: "50 g" }],
  materials: ["Hyaluronic acid"],
  price: null,
  claims: [{ text: "Clinically proven", sourceRef: "p1" }],
  audience: null,
  tone: null,
  missingFields: [],
};

describe("composeImagePrompt", () => {
  it("keeps the fixed slot prompt and adds the document facts after it", () => {
    const prompt = composeImagePrompt("Place this product on a shelf.", pkr);
    expect(prompt.startsWith("Place this product on a shelf.")).toBe(true);
    expect(prompt).toContain("Product name: Aqua Gel SPF 50");
    expect(prompt).toContain("Volume: 50 g");
  });

  it("does not send marketing claims to the image model", () => {
    expect(composeImagePrompt("x", pkr)).not.toContain("Clinically proven");
  });
});
