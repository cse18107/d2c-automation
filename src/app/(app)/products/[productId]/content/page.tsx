import { connection } from "next/server";
import { Suspense } from "react";
import { ContentPanel } from "@/components/content/content-panel";
import { idParam } from "@/server/http/api";

// Generated content for one product: PKR, creatives, videos, listing text.
export default function ContentPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  return (
    <main className="space-y-6 p-8">
      <h1 className="text-2xl font-semibold">Content</h1>
      <Suspense fallback={<output className="block">Loading content…</output>}>
        <ContentLoader params={params} />
      </Suspense>
    </main>
  );
}

// Reads the route params after the request starts, inside Suspense, so the page
// shell can stream and client navigation stays instant.
async function ContentLoader({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  await connection();
  const { productId } = await params;
  return <ContentPanel productId={idParam(productId)} />;
}
