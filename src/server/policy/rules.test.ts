import { describe, expect, it } from "vitest";
import type { PkrBody } from "@/schemas/pkr";
import {
  checkCopy,
  checkFakeOfficialOrDiscount,
  checkMedicalOrBeforeAfter,
  checkProhibitedClaims,
  checkTrademarks,
  checkUnsupportedNumbers,
  hasBlockingFinding,
} from "./rules";

const pkr: PkrBody = {
  name: "Hyaluronic Aqua Gel SPF 50",
  features: ["Lightweight aqua gel", "No white cast"],
  specs: [{ label: "Volume", value: "50 g" }],
  materials: [],
  price: null,
  claims: [{ text: "SPF 50 PA++++", sourceRef: "page 1" }],
  audience: null,
  tone: null,
  missingFields: [],
};

describe("checkProhibitedClaims", () => {
  it("blocks a medical claim the PKR does not make", () => {
    const findings = checkProhibitedClaims("This gel will cure acne.", pkr);
    expect(findings.map((f) => f.ruleId)).toEqual(["prohibited_claims"]);
    expect(hasBlockingFinding(findings)).toBe(true);
  });

  it("allows a term when the PKR itself states it", () => {
    const withCure: PkrBody = {
      ...pkr,
      claims: [{ text: "helps cure dryness", sourceRef: "page 2" }],
    };
    expect(checkProhibitedClaims("Helps cure dryness.", withCure)).toEqual([]);
  });

  it("matches whole words only", () => {
    expect(checkProhibitedClaims("A secure fit.", pkr)).toEqual([]);
  });
});

describe("checkMedicalOrBeforeAfter", () => {
  it("blocks before-and-after wording", () => {
    expect(
      checkMedicalOrBeforeAfter("See the before and after results"),
    ).toHaveLength(1);
  });

  it("passes ordinary copy", () => {
    expect(checkMedicalOrBeforeAfter("Glides on in seconds.")).toEqual([]);
  });
});

describe("checkUnsupportedNumbers", () => {
  it("passes numbers that appear in the PKR", () => {
    expect(checkUnsupportedNumbers("SPF 50 and 50 g tube", pkr)).toEqual([]);
  });

  it("blocks a number the PKR does not contain", () => {
    const findings = checkUnsupportedNumbers(
      "Clinically tested over 200 days",
      pkr,
    );
    expect(findings.map((f) => f.message)).toEqual([
      "Number 200 is not in the product knowledge record",
    ]);
  });

  it("does not treat a substring of a PKR number as a match", () => {
    // "5" appears inside "50" in the PKR, but a standalone 5 is not in the PKR.
    expect(checkUnsupportedNumbers("Only 5 steps", pkr)).toHaveLength(1);
  });
});

describe("checkFakeOfficialOrDiscount", () => {
  it("blocks an official badge the PKR does not support", () => {
    expect(
      checkFakeOfficialOrDiscount("Official brand store", pkr),
    ).toHaveLength(1);
  });

  it("blocks a percentage discount", () => {
    expect(checkFakeOfficialOrDiscount("Get 20% off today", pkr)).toHaveLength(
      1,
    );
  });
});

describe("checkTrademarks", () => {
  it("blocks a competitor name not in the PKR", () => {
    const findings = checkTrademarks(
      "Better than Neutrogena",
      ["Neutrogena"],
      pkr,
    );
    expect(findings[0]?.ruleId).toBe("trademark_or_competitor");
  });
});

describe("checkCopy", () => {
  it("returns no blocking findings for clean, supported copy", () => {
    const findings = checkCopy({
      text: "Lightweight SPF 50 aqua gel with no white cast.",
      pkr,
    });
    expect(hasBlockingFinding(findings)).toBe(false);
  });

  it("blocks copy that mixes a supported fact with an invented one", () => {
    const findings = checkCopy({
      text: "SPF 50 and dermatologist approved in 2019",
      pkr,
    });
    expect(hasBlockingFinding(findings)).toBe(true);
  });
});
