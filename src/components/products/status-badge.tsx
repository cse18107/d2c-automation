import { cn } from "@/lib/utils";
import type { ProductStatus } from "@/schemas/product";

// Labels and colours from design frame 01 (status chips). Text carries the meaning,
// colour only reinforces it.
const CHIP: Record<ProductStatus, { label: string; className: string }> = {
  draft: {
    label: "Draft",
    className: "bg-secondary text-secondary-foreground",
  },
  processing: {
    label: "Processing",
    className: "bg-secondary text-secondary-foreground",
  },
  ready_for_review: {
    label: "Pending review",
    className: "bg-accent text-accent-foreground",
  },
  approved: { label: "Approved", className: "bg-[#f4f3ff] text-[#5925dc]" },
  published: { label: "Published", className: "bg-[#ecfdf3] text-[#027a48]" },
  failed: { label: "Failed", className: "bg-[#fef3f2] text-[#b42318]" },
};

export function StatusBadge({ status }: { status: ProductStatus }) {
  const chip = CHIP[status];
  return (
    <span
      className={cn(
        "inline-flex rounded-md px-2 py-1 text-xs font-medium uppercase tracking-wide",
        chip.className,
      )}
    >
      {chip.label}
    </span>
  );
}

export function statusLabel(status: ProductStatus): string {
  return CHIP[status].label;
}
