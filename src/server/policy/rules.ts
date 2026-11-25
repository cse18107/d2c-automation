import "server-only";
import type { PkrBody } from "@/schemas/pkr";

// Deterministic policy checks (spec §8, CLAUDE.md §7.10). Pure: text in,
// findings out. A `block` finding stops the item from reaching review.
export type PolicySeverity = "block" | "warn";

export type PolicyFinding = {
  ruleId: string;
  severity: PolicySeverity;
  message: string;
};

// Words that make medical or efficacy claims (spec §8 prohibited_claims).
const PROHIBITED_TERMS = [
  "cure",
  "cures",
  "treat",
  "treats",
  "heal",
  "heals",
  "prevent disease",
  "guaranteed results",
  "clinically proven",
] as const;

const MEDICAL_OR_BEFORE_AFTER =
  /\bbefore and after\b|\bbefore\/after\b|\bdiagnos\w*|\bmedical\b/i;

const FAKE_OFFICIAL_OR_DISCOUNT =
  /\b(official|certified|bestseller|best seller)\b|%\s*off\b|\bdiscount\b/i;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsWord(haystack: string, term: string): boolean {
  return new RegExp(`\\b${escapeRegExp(term)}\\b`, "i").test(haystack);
}

// A claim is allowed only when the PKR states it, with a source (spec §8).
function pkrText(pkr: PkrBody): string {
  return JSON.stringify(pkr);
}

export function checkProhibitedClaims(
  text: string,
  pkr: PkrBody,
): PolicyFinding[] {
  const supported = pkrText(pkr);
  return PROHIBITED_TERMS.filter(
    (term) => containsWord(text, term) && !containsWord(supported, term),
  ).map((term) => ({
    ruleId: "prohibited_claims",
    severity: "block" as const,
    message: `Prohibited claim wording: "${term}"`,
  }));
}

export function checkMedicalOrBeforeAfter(text: string): PolicyFinding[] {
  return MEDICAL_OR_BEFORE_AFTER.test(text)
    ? [
        {
          ruleId: "medical_or_before_after",
          severity: "block",
          message: "Medical or before/after wording is not allowed",
        },
      ]
    : [];
}

// Every number in copy must appear in the PKR (spec §8: PKR is the only source
// of claims). Matches "350", "1.5", "12%" and the like.
export function checkUnsupportedNumbers(
  text: string,
  pkr: PkrBody,
): PolicyFinding[] {
  const supported = pkrText(pkr);
  const numbers = text.match(/\d+(?:\.\d+)?/g) ?? [];
  const missing = [...new Set(numbers)].filter(
    (n) =>
      !new RegExp(`(?<![\\d.])${escapeRegExp(n)}(?![\\d])`).test(supported),
  );
  return missing.map((n) => ({
    ruleId: "unsupported_fact",
    severity: "block" as const,
    message: `Number ${n} is not in the product knowledge record`,
  }));
}

export function checkFakeOfficialOrDiscount(
  text: string,
  pkr: PkrBody,
): PolicyFinding[] {
  const match = text.match(FAKE_OFFICIAL_OR_DISCOUNT);
  if (match === null) return [];
  const term = match[0].toLowerCase();
  if (containsWord(pkrText(pkr), term.replace(/[^a-z ]/g, "").trim())) {
    return [];
  }
  return [
    {
      ruleId: "fake_official_or_discount",
      severity: "block",
      message: `Unsupported badge or offer wording: "${match[0]}"`,
    },
  ];
}

export function checkTrademarks(
  text: string,
  blockedNames: readonly string[],
  pkr: PkrBody,
): PolicyFinding[] {
  const supported = pkrText(pkr);
  return blockedNames
    .filter(
      (name) => containsWord(text, name) && !containsWord(supported, name),
    )
    .map((name) => ({
      ruleId: "trademark_or_competitor",
      severity: "block" as const,
      message: `Competitor or trademark name: "${name}"`,
    }));
}

// Runs every text check on one piece of copy.
export function checkCopy(input: {
  text: string;
  pkr: PkrBody;
  blockedNames?: readonly string[];
}): PolicyFinding[] {
  return [
    ...checkProhibitedClaims(input.text, input.pkr),
    ...checkMedicalOrBeforeAfter(input.text),
    ...checkUnsupportedNumbers(input.text, input.pkr),
    ...checkFakeOfficialOrDiscount(input.text, input.pkr),
    ...checkTrademarks(input.text, input.blockedNames ?? [], input.pkr),
  ];
}

// A finding with severity block means the item cannot be used in review.
export function hasBlockingFinding(
  findings: readonly PolicyFinding[],
): boolean {
  return findings.some((f) => f.severity === "block");
}
