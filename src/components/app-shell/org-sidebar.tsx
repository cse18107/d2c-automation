import { eq } from "drizzle-orm";
import { connection } from "next/server";
import { getDb } from "@/server/db";
import { organizations } from "@/server/db/schema";
import { getSession } from "@/server/session";
import { Sidebar } from "./sidebar";

// Reads the org name for the sidebar. Async so it can stream inside a Suspense boundary.
export async function OrgSidebar() {
  await connection();
  const session = getSession();
  const [org] = await getDb()
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, session.orgId))
    .limit(1);
  return <Sidebar orgName={org?.name ?? "Brand"} activePath="/products" />;
}

export function SidebarSkeleton() {
  return (
    <aside
      aria-busy="true"
      className="w-[232px] shrink-0 border-r border-border bg-sidebar"
    />
  );
}
