import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Frame 02 layout: breadcrumb, three-step indicator, and two columns.
const STEPS = ["Upload assets", "Extract PKR", "Confirm facts"] as const;

export function WizardFrame({
  breadcrumb,
  children,
  side,
}: {
  breadcrumb: ReactNode;
  children: ReactNode;
  side: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">{breadcrumb}</p>
        <ol className="flex flex-wrap gap-6" aria-label="Steps">
          {STEPS.map((label, index) => {
            const current = index === 0;
            return (
              <li
                key={label}
                aria-current={current ? "step" : undefined}
                className={cn(
                  "flex items-center gap-3 text-sm",
                  current
                    ? "font-medium text-foreground"
                    : "text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex size-6 items-center justify-center rounded-full text-xs font-semibold",
                    current
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground",
                  )}
                >
                  {index + 1}
                </span>
                {label}
              </li>
            );
          })}
        </ol>
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_352px]">
        <div className="flex min-w-0 flex-col gap-6">{children}</div>
        <aside className="flex flex-col gap-4 self-start rounded-lg bg-card p-6">
          {side}
        </aside>
      </div>
    </div>
  );
}
