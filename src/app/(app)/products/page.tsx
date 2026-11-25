import { eq } from "drizzle-orm";
import Link from "next/link";
import { connection } from "next/server";
import { EmptyProducts } from "@/components/products/empty-products";
import { ProductTable } from "@/components/products/product-table";
import { StatusFilter } from "@/components/products/status-filter";
import { Button } from "@/components/ui/button";
import { listProductsQuerySchema } from "@/schemas/api";
import { productStatusSchema } from "@/schemas/product";
import { getDb } from "@/server/db";
import { organizations } from "@/server/db/schema";
import { countProductsByStatus, listProducts } from "@/server/products/service";
import { getSession } from "@/server/session";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await connection();
  const params = await searchParams;
  const requested = typeof params.status === "string" ? params.status : "all";
  const status = productStatusSchema.safeParse(requested);
  const filter = status.success ? status.data : undefined;

  const db = getDb();
  const session = getSession();
  const query = listProductsQuerySchema.parse({ status: filter, limit: 50 });
  const [items, counts, [org]] = await Promise.all([
    listProducts(db, session, query),
    countProductsByStatus(db, session),
    db
      .select({ pausePublishing: organizations.pausePublishing })
      .from(organizations)
      .where(eq(organizations.id, session.orgId))
      .limit(1),
  ]);

  return (
    <>
      <PublishingBanner paused={org?.pausePublishing ?? false} />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Products
        </h1>
        <Button asChild className="h-10 rounded-lg px-4 text-sm font-medium">
          <Link href="/products/new">+ New product</Link>
        </Button>
      </div>

      <StatusFilter current={filter ?? "all"} counts={counts} />

      {items.length === 0 ? (
        filter ? (
          <p className="text-sm text-muted-foreground">
            No products with this status.
          </p>
        ) : (
          <EmptyProducts />
        )
      ) : (
        <ProductTable items={items} />
      )}
    </>
  );
}

// Kill-switch banner from design frame 01. Green when publishing is on, red when paused.
function PublishingBanner({ paused }: { paused: boolean }) {
  if (paused) {
    return (
      <output className="block rounded-lg bg-[#fef3f2] px-4 py-3 text-sm">
        <span className="font-medium text-[#b42318]">Publishing is paused</span>
        <span className="text-secondary-foreground">
          {" "}
          · Nothing is sent to platforms until you resume.
        </span>
      </output>
    );
  }
  return (
    <output className="block rounded-lg bg-[#ecfdf3] px-4 py-3 text-sm">
      <span className="font-medium text-[#027a48]">Publishing is ON</span>
      <span className="text-secondary-foreground">
        {" "}
        · Sandbox connections only · Pause all publishing lives in Settings
      </span>
    </output>
  );
}
