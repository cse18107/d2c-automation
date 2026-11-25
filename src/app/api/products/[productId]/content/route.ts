import {
  contentJobResponseSchema,
  contentOutputsResponseSchema,
  startContentInputSchema,
} from "@/schemas/content-job";
import {
  getContentOutputs,
  getLatestJobs,
  startContentJob,
} from "@/server/content/service";
import { getDb } from "@/server/db";
import {
  handleApi,
  idParam,
  jsonResponse,
  readJson,
  requireIdempotencyKey,
  requireWriter,
} from "@/server/http/api";

type Params = { params: Promise<{ productId: string }> };

// The generated outputs for the content screen.
export async function GET(
  _request: Request,
  { params }: Params,
): Promise<Response> {
  const { productId } = await params;
  return handleApi(async (session) => {
    const outputs = await getContentOutputs(
      getDb(),
      session,
      idParam(productId),
    );
    return jsonResponse(contentOutputsResponseSchema, outputs);
  });
}

// Starts one run (text, images or videos). Needs an Idempotency-Key and a confirmed cost.
export async function POST(
  request: Request,
  { params }: Params,
): Promise<Response> {
  const { productId } = await params;
  return handleApi(async (session) => {
    requireWriter(session);
    const key = requireIdempotencyKey(request);
    const input = startContentInputSchema.parse(await readJson(request));
    const db = getDb();
    const id = idParam(productId);
    const { created } = await startContentJob(db, session, id, key, input);
    const latest = await getLatestJobs(db, session, id);
    return jsonResponse(
      contentJobResponseSchema,
      { job: latest.latest, productStatus: latest.productStatus },
      created ? 202 : 200,
    );
  });
}
