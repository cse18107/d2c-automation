import Link from "next/link";
import { cn } from "@/lib/utils";

// Chip filters from design frame 01. Plain links, so filtering works without JavaScript.
// "Draft" is added: drafts are where Step 01 starts, and the design has no chip for them.
const FILTERS = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "ready_for_review", label: "Ready for review" },
  { value: "processing", label: "Processing" },
  { value: "published", label: "Published" },
  { value: "failed", label: "Failed" },
] as const;

export function StatusFilter({
  current,
  counts,
}: {
  current: string;
  counts: Record<string, number>;
}) {
  return (
    <nav
      aria-label="Filter products by status"
      className="flex flex-wrap gap-2"
    >
      {FILTERS.map((filter) => {
        const active = current === filter.value;
        return (
          <Link
            key={filter.value}
            href={
              filter.value === "all"
                ? "/products"
                : `/products?status=${filter.value}`
            }
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex h-8 items-center gap-2 rounded-lg border px-3 text-sm",
              active
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-card text-secondary-foreground hover:bg-secondary",
            )}
          >
            {filter.label}
            <span
              className={cn(
                "tabular-nums",
                active ? "text-background/80" : "text-muted-foreground",
              )}
            >
              {counts[filter.value] ?? 0}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
