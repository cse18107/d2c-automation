import type { ProductStatus } from "@/schemas/product";
import { ConflictError } from "@/server/errors";

// Step 01 only moves a product between draft, processing and failed. The
// approval and publishing states exist in the schema but are not reachable from
// this code (CLAUDE.md §7). A test asserts that.
const STEP01_TRANSITIONS: Partial<
  Record<ProductStatus, readonly ProductStatus[]>
> = {
  draft: ["processing"],
  processing: ["draft", "failed"],
  failed: ["processing", "draft"],
};

export function canTransition(from: ProductStatus, to: ProductStatus): boolean {
  return STEP01_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: ProductStatus, to: ProductStatus): void {
  if (!canTransition(from, to)) {
    throw new ConflictError(`A product cannot move from ${from} to ${to} here`);
  }
}
