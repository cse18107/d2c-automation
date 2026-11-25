import { ingestJobResponseSchema } from "@/schemas/api";
import { getDb } from "@/server/db";
import { NotFoundError } from "@/server/errors";
import {
  handleApi,
  idParam,
  jsonResponse,
  requireWriter,
} from "@/server/http/api";
import {
  cancelActiveIngest,
  getLatestIngest,
} from "@/server/products/ingest-control";

type Params = { params: Promise<{ productId: string }> };

export async function POST(
  _request: Request,
  { params }: Params,
): Promise<Response> {
  const { productId } = await params;
  return handleApi(async (session) => {
    requireWriter(session);
    const id = idParam(productId);
    const product = await cancelActiveIngest(getDb(), session, id);
    const job = await getLatestIngest(getDb(), session, id);
    if (!job) throw new NotFoundError("No ingest job for this product");
    return jsonResponse(ingestJobResponseSchema, { job, product });
  });
}
