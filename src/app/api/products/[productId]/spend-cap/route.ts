import { spendCapInputSchema, spendCapResponseSchema } from "@/schemas/money";
import { setSpendCap } from "@/server/content/service";
import { getDb } from "@/server/db";
import { handleApi, idParam, jsonResponse, readJson } from "@/server/http/api";

type Params = { params: Promise<{ productId: string }> };

// Owner only. The app never raises the cap on its own (CLAUDE.md §7.5).
export async function PUT(
  request: Request,
  { params }: Params,
): Promise<Response> {
  const { productId } = await params;
  return handleApi(async (session) => {
    const input = spendCapInputSchema.parse(await readJson(request));
    await setSpendCap(
      getDb(),
      session,
      idParam(productId),
      input.capMinor,
      input.currency,
    );
    return jsonResponse(spendCapResponseSchema, input);
  });
}
