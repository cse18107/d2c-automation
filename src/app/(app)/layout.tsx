import { Suspense } from "react";
import {
  OrgSidebar,
  SidebarSkeleton,
} from "@/components/app-shell/org-sidebar";
import { Toaster } from "@/components/ui/sonner";

// Data-dependent parts stream inside Suspense: the sidebar here, and each page's
// own request-time data. Without the boundary Next cannot prerender the shell.
export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen flex-1">
      <Suspense fallback={<SidebarSkeleton />}>
        <OrgSidebar />
      </Suspense>
      <main className="flex min-w-0 flex-1 flex-col gap-6 px-8 py-6">
        <Suspense
          fallback={
            <div
              aria-busy="true"
              className="h-64 animate-pulse rounded-lg bg-card"
            />
          }
        >
          {children}
        </Suspense>
      </main>
      <Toaster />
    </div>
  );
}
