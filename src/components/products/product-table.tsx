import Link from "next/link";
import type { ProductListItem } from "@/schemas/api";
import { StatusBadge } from "./status-badge";

// Columns from design frame 01. SKU, creatives, listings and approvals come from
// later steps, so they show "—" until those steps exist.
function hrefFor(item: ProductListItem): string {
  return item.status === "draft"
    ? `/products/${item.id}/upload`
    : `/products/${item.id}/processing`;
}

const HEAD =
  "px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground";
const CELL = "px-6 py-4 text-sm";

export function ProductTable({ items }: { items: ProductListItem[] }) {
  return (
    <div className="overflow-x-auto rounded-lg bg-card">
      <table className="w-full min-w-[960px] border-collapse">
        <thead className="bg-card">
          <tr>
            <th scope="col" className={HEAD}>
              Product
            </th>
            <th scope="col" className={HEAD}>
              SKU
            </th>
            <th scope="col" className={HEAD}>
              Status
            </th>
            <th scope="col" className={HEAD}>
              Creatives
            </th>
            <th scope="col" className={HEAD}>
              Listings
            </th>
            <th scope="col" className={HEAD}>
              Pending approvals
            </th>
            <th scope="col" className={HEAD}>
              Updated
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#eaecf0]">
          {items.map((item) => (
            <tr key={item.id} className="hover:bg-background/60">
              <td className={CELL}>
                <Link
                  href={hrefFor(item)}
                  className="font-semibold text-foreground hover:underline"
                >
                  {item.name}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {item.imageCount} {item.imageCount === 1 ? "photo" : "photos"}
                  {item.documentName ? ` · ${item.documentName}` : ""}
                </p>
                <Link
                  href={`/products/${item.id}/content`}
                  className="text-xs font-medium text-primary underline"
                >
                  Open content
                </Link>
              </td>
              <td className={`${CELL} text-muted-foreground`}>—</td>
              <td className={CELL}>
                <StatusBadge status={item.status} />
              </td>
              <td className={CELL}>—</td>
              <td className={CELL}>—</td>
              <td className={`${CELL} text-muted-foreground`}>—</td>
              <td className={`${CELL} whitespace-nowrap text-muted-foreground`}>
                <time dateTime={item.updatedAt}>
                  {formatUpdated(item.updatedAt)}
                </time>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Relative times as in the design ("2 h ago", "Yesterday"), absolute after a week.
function formatUpdated(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}
