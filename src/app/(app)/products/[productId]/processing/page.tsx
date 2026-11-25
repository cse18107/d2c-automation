import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ProcessingStatus } from "@/components/products/processing-status";
import { getDb } from "@/server/db";
import { NotFoundError } from "@/server/errors";
import { idParam } from "@/server/http/api";
import { getProductDetail } from "@/server/products/service";
import { getSession } from "@/server/session";

export default async function ProcessingPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  // Data depends on the request (session, live status), so never prerender it.
  await connection();
  const { productId } = await params;
  try {
    const detail = await getProductDetail(
      getDb(),
      getSession(),
      idParam(productId),
    );
    return <ProcessingStatus productId={detail.product.id} />;
  } catch (error: unknown) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}
