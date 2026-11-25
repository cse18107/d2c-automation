import {
  ingestJobResponseSchema,
  submitIngestInputSchema,
} from "@/schemas/api";
import { getDb } from "@/server/db";
import { NotFoundError } from "@/server/errors";
import {
  handleApi,
  idParam,
  jsonResponse,
  readJson,
  requireIdempotencyKey,
  requireWriter,
} from "@/server/http/api";
import { getLatestIngest } from "@/server/products/ingest-control";
import { toProduct } from "@/server/products/mappers";
import { loadProductRow, submitForIngest } from "@/server/products/service";

type Params = { params: Promise<{ productId: string }> };

export async function GET(
  _request: Request,
  { params }: Params,
): Promise<Response> {
  const { productId } = await params;
  return handleApi(async (session) => {
    const id = idParam(productId);
    const db = getDb();
    const job = await getLatestIngest(db, session, id);
    if (!job) throw new NotFoundError("No ingest job for this product yet");
    const product = toProduct(await loadProductRow(db, session, id));
    return jsonResponse(ingestJobResponseSchema, { job, product });
  });
}

export async function POST(
  request: Request,
  { params }: Params,
): Promise<Response> {
  const { productId } = await params;
  return handleApi(async (session) => {
    requireWriter(session);
    const key = requireIdempotencyKey(request);
    submitIngestInputSchema.parse(await readJson(request));
    const result = await submitForIngest(
      getDb(),
      session,
      idParam(productId),
      key,
    );
    return jsonResponse(
      ingestJobResponseSchema,
      result,
      result.created ? 202 : 200,
    );
  });
}
