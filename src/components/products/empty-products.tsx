import Link from "next/link";
import { Button } from "@/components/ui/button";

// Empty state A, design frame 14.
export function EmptyProducts() {
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg bg-card p-6">
      <h2 className="text-lg font-semibold text-foreground">
        Add your first product
      </h2>
      <p className="max-w-2xl text-sm text-secondary-foreground">
        Upload photos and a product document. We build a Product Knowledge
        Record, then draft creatives and listings from it.
      </p>
      <Button asChild>
        <Link href="/products/new">+ New product</Link>
      </Button>
    </div>
  );
}
