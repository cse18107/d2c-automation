import { getDb } from "@/server/db";
import { handleApi, idParam, requireWriter } from "@/server/http/api";
import { removeAsset } from "@/server/products/assets";

type Params = { params: Promise<{ productId: string; assetId: string }> };

export async function DELETE(
  _request: Request,
  { params }: Params,
): Promise<Response> {
  const { productId, assetId } = await params;
  return handleApi(async (session) => {
    requireWriter(session);
    await removeAsset(getDb(), session, idParam(productId), idParam(assetId));
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  });
}
