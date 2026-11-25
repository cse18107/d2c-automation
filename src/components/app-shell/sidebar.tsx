import Link from "next/link";
import { cn } from "@/lib/utils";

// Navigation from design frames 01–17. Only Products exists in Step 01; the
// rest are shown in place so the layout matches the design, and are inert.
const NAV = [
  { label: "Products", href: "/products", live: true },
  { label: "Review queue", href: "/review", live: false },
  { label: "Publishing", href: "/publishing", live: false },
  { label: "Connections", href: "/connections", live: false },
  { label: "AI models", href: "/settings/ai-models", live: false },
  { label: "Audit log", href: "/audit", live: false },
  { label: "Settings", href: "/settings", live: false },
] as const;

export function Sidebar({
  orgName,
  activePath,
}: {
  orgName: string;
  activePath: string;
}) {
  return (
    <aside className="flex w-[232px] shrink-0 flex-col gap-6 border-r border-border bg-sidebar px-4 py-6">
      <div className="flex flex-col gap-1 px-3">
        <Link
          href="/products"
          className="text-xl font-bold tracking-tight text-primary"
        >
          d2c-autopilot
        </Link>
        <p className="text-xs text-muted-foreground">{orgName} · Brand</p>
      </div>
      <nav aria-label="Main" className="flex flex-col gap-1">
        {NAV.map((item) => {
          const active = item.live && activePath.startsWith(item.href);
          const className = cn(
            "rounded-lg px-3 py-2 text-sm",
            active
              ? "bg-accent font-medium text-accent-foreground"
              : "text-secondary-foreground",
            !item.live && "cursor-default text-muted-foreground",
          );
          if (!item.live) {
            return (
              <span
                key={item.label}
                className={className}
                aria-disabled="true"
                title="Available in a later step"
              >
                {item.label}
              </span>
            );
          }
          return (
            <Link
              key={item.label}
              href={item.href}
              className={className}
              aria-current={active ? "page" : undefined}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
