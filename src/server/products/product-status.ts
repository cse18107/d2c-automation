import type { ProductStatus } from "@/schemas/product";
import { ConflictError } from "@/server/errors";

// Ingest (Step 01) and content generation (Step 02) move a product between
// draft, processing, ready_for_review and failed. Approval and publishing states
// exist in the schema but are not reachable from this code (CLAUDE.md §7). A test
// asserts that.
const STEP02_TRANSITIONS: Partial<
  Record<ProductStatus, readonly ProductStatus[]>
> = {
  draft: ["processing"],
  processing: ["draft", "failed", "ready_for_review"],
  ready_for_review: ["processing"],
  failed: ["processing", "draft"],
};

export function canTransition(from: ProductStatus, to: ProductStatus): boolean {
  return STEP02_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: ProductStatus, to: ProductStatus): void {
  if (!canTransition(from, to)) {
    throw new ConflictError(`A product cannot move from ${from} to ${to} here`);
  }
}
