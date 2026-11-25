"use client";

import { Button } from "@/components/ui/button";

export default function ProductsError({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-lg bg-card p-6"
    >
      <h2 className="text-lg font-semibold text-foreground">
        The products could not be loaded
      </h2>
      <p className="text-sm text-secondary-foreground">
        Check your connection and try again.
      </p>
      <Button variant="outline" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
