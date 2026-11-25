import { productResponseSchema } from "@/schemas/api";
import { getDb } from "@/server/db";
import {
  handleApi,
  idParam,
  jsonResponse,
  requireWriter,
} from "@/server/http/api";
import { returnToDraft } from "@/server/products/ingest-control";
import { getProductDetail } from "@/server/products/service";

type Params = { params: Promise<{ productId: string }> };

export async function POST(
  _request: Request,
  { params }: Params,
): Promise<Response> {
  const { productId } = await params;
  return handleApi(async (session) => {
    requireWriter(session);
    const id = idParam(productId);
    await returnToDraft(getDb(), session, id);
    const detail = await getProductDetail(getDb(), session, id);
    return jsonResponse(productResponseSchema, detail);
  });
}
