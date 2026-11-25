import {
  listProductsQuerySchema,
  productListResponseSchema,
  productResponseSchema,
} from "@/schemas/api";
import { createProductInputSchema } from "@/schemas/product";
import { getDb } from "@/server/db";
import {
  handleApi,
  jsonResponse,
  readJson,
  requireWriter,
} from "@/server/http/api";
import { createProduct, listProducts } from "@/server/products/service";

export async function GET(request: Request): Promise<Response> {
  return handleApi(async (session) => {
    const query = listProductsQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const items = await listProducts(getDb(), session, query);
    return jsonResponse(productListResponseSchema, { items });
  });
}

export async function POST(request: Request): Promise<Response> {
  return handleApi(async (session) => {
    requireWriter(session);
    const input = createProductInputSchema.parse(await readJson(request));
    const product = await createProduct(getDb(), session, input);
    return jsonResponse(productResponseSchema, { product, assets: [] }, 201);
  });
}
