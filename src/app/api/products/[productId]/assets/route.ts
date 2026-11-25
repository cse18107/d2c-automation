import {
  assetUploadTicketSchema,
  requestAssetUploadInputSchema,
} from "@/schemas/api";
import { getDb } from "@/server/db";
import {
  handleApi,
  idParam,
  jsonResponse,
  readJson,
  requireWriter,
} from "@/server/http/api";
import { requestAssetUpload } from "@/server/products/assets";

type Params = { params: Promise<{ productId: string }> };

export async function POST(
  request: Request,
  { params }: Params,
): Promise<Response> {
  const { productId } = await params;
  return handleApi(async (session) => {
    requireWriter(session);
    const input = requestAssetUploadInputSchema.parse(await readJson(request));
    const ticket = await requestAssetUpload(
      getDb(),
      session,
      idParam(productId),
      input,
    );
    return jsonResponse(assetUploadTicketSchema, ticket, 201);
  });
}
