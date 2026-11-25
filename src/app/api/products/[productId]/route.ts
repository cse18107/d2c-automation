import { productResponseSchema } from "@/schemas/api";
import { getDb } from "@/server/db";
import {
  handleApi,
  idParam,
  jsonResponse,
  requireWriter,
} from "@/server/http/api";
import {
  deleteDraftProduct,
  getProductDetail,
} from "@/server/products/service";

type Params = { params: Promise<{ productId: string }> };

export async function GET(
  _request: Request,
  { params }: Params,
): Promise<Response> {
  const { productId } = await params;
  return handleApi(async (session) => {
    const detail = await getProductDetail(getDb(), session, idParam(productId));
    return jsonResponse(productResponseSchema, detail);
  });
}

export async function DELETE(
  _request: Request,
  { params }: Params,
): Promise<Response> {
  const { productId } = await params;
  return handleApi(async (session) => {
    requireWriter(session);
    await deleteDraftProduct(getDb(), session, idParam(productId));
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  });
}
