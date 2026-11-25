import { describe, expect, it } from "vitest";
import type { PkrBody } from "@/schemas/pkr";
import { buildProductFacts } from "./product-facts";

const pkr: PkrBody = {
  name: "Aqua Gel SPF 50",
  features: ["Lightweight gel", "No white cast"],
  specs: [{ label: "Volume", value: "50 g" }],
  materials: ["Hyaluronic acid"],
  price: { minor: 1999, currency: "USD" },
  claims: [{ text: "Clinically proven", sourceRef: "p1" }],
  audience: "Oily skin",
  tone: null,
  missingFields: ["colour"],
};

describe("buildProductFacts", () => {
  it("includes name, materials, specs and features from the PKR", () => {
    const facts = buildProductFacts(pkr);
    expect(facts).toContain("Product name: Aqua Gel SPF 50");
    expect(facts).toContain("Materials: Hyaluronic acid");
    expect(facts).toContain("Volume: 50 g");
    expect(facts).toContain("Lightweight gel");
  });

  it("leaves out claims, price, audience and missing fields", () => {
    const facts = buildProductFacts(pkr);
    expect(facts).not.toContain("Clinically proven");
    expect(facts).not.toContain("1999");
    expect(facts).not.toContain("Oily skin");
    expect(facts).not.toContain("colour");
  });

  it("caps the length", () => {
    const long = {
      ...pkr,
      features: Array.from({ length: 200 }, (_, i) =>
        `feature ${i} `.repeat(3),
      ),
    };
    expect(buildProductFacts(long).length).toBeLessThanOrEqual(800);
  });
});
