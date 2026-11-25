import type { ReactNode } from "react";

// Side panel from design frame 02. Controls specific to a step go in children.
export function WhatHappensNext({ children }: { children?: ReactNode }) {
  return (
    <>
      <h2 className="text-base font-semibold text-foreground">
        What happens next
      </h2>
      <ol className="flex flex-col gap-3 text-sm text-secondary-foreground">
        <li>
          1. We read the document and photos into a Product Knowledge Record
          (PKR).
        </li>
        <li>
          2. Creatives, videos and listings are drafted only from PKR facts.
        </li>
        <li>3. Nothing is published until you approve it per platform.</li>
      </ol>
      <div className="border-t border-border pt-4 text-sm text-muted-foreground">
        Missing data (e.g. certifications) is left out and flagged for you.
      </div>
      {children}
    </>
  );
}
