import "server-only";
import type { PkrBody } from "@/schemas/pkr";

// Facts from the product knowledge record (built from the uploaded document) that
// are added to every image prompt. Only physical facts are used: name, materials,
// specs and features. Claims, price and audience are left out, because the image
// model would draw them as text. Missing fields are not filled in (CLAUDE.md §8).
const MAX_FACTS_CHARS = 800;

export function buildProductFacts(pkr: PkrBody): string {
  const lines: string[] = [`Product name: ${pkr.name}`];
  if (pkr.materials.length > 0) {
    lines.push(`Materials: ${pkr.materials.join(", ")}`);
  }
  if (pkr.specs.length > 0) {
    lines.push(
      `Specifications: ${pkr.specs.map((s) => `${s.label}: ${s.value}`).join("; ")}`,
    );
  }
  if (pkr.features.length > 0) {
    lines.push(`Features: ${pkr.features.join("; ")}`);
  }
  return lines.join("\n").slice(0, MAX_FACTS_CHARS);
}
