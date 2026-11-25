import { notFound } from "next/navigation";
import { connection } from "next/server";
import { UploadStep } from "@/components/products/upload-step";
import { getDb } from "@/server/db";
import { NotFoundError } from "@/server/errors";
import { idParam } from "@/server/http/api";
import { getProductDetail } from "@/server/products/service";
import { getSession } from "@/server/session";

export default async function UploadPage({
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
    if (detail.product.status !== "draft") {
      // Files are locked once processing starts (spec §4). Show the status instead.
      notFound();
    }
    return (
      <UploadStep
        productId={detail.product.id}
        productName={detail.product.name}
        initialAssets={detail.assets}
      />
    );
  } catch (error: unknown) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}
