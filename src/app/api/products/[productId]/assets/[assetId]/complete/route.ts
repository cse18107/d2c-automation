import { productAssetResponseSchema } from "@/schemas/api";
import { getDb } from "@/server/db";
import {
  handleApi,
  idParam,
  jsonResponse,
  requireWriter,
} from "@/server/http/api";
import { completeAssetUpload } from "@/server/products/assets";

type Params = { params: Promise<{ productId: string; assetId: string }> };

export async function POST(
  _request: Request,
  { params }: Params,
): Promise<Response> {
  const { productId, assetId } = await params;
  return handleApi(async (session) => {
    requireWriter(session);
    const asset = await completeAssetUpload(
      getDb(),
      session,
      idParam(productId),
      idParam(assetId),
    );
    return jsonResponse(productAssetResponseSchema, { asset });
  });
}
