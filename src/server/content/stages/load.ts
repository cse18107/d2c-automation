import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { productAssets, products } from "@/server/db/schema";
import { withOrg } from "@/server/db/with-org";
import { NotFoundError, ValidationError } from "@/server/errors";
import type { StageContext } from "./context";

export type PhotoRef = { key: string; mimeType: string };

export type ProductInputs = {
  productName: string;
  documentText: string;
  photo: PhotoRef;
};

// Loads what generation needs: the product name, the parsed document text and the
// first verified photo. Nothing here is sent to a model until a stage uses it.
export async function loadProductInputs(
  ctx: StageContext,
): Promise<ProductInputs> {
  const { orgId, productId } = ctx.scope;
  const [product] = await ctx.db
    .select({ name: products.name })
    .from(products)
    .where(and(withOrg(products, orgId), eq(products.id, productId)))
    .limit(1);
  if (!product) throw new NotFoundError("Product not found");

  const assets = await ctx.db
    .select({
      kind: productAssets.kind,
      storageKey: productAssets.storageKey,
      mimeType: productAssets.mimeType,
      parsedText: productAssets.parsedText,
      verifiedAt: productAssets.verifiedAt,
    })
    .from(productAssets)
    .where(
      and(
        withOrg(productAssets, orgId),
        eq(productAssets.productId, productId),
      ),
    )
    .orderBy(asc(productAssets.sortOrder));

  const verified = assets.filter((a) => a.verifiedAt !== null);
  const photo = verified.find((a) => a.kind === "image");
  const document = verified.find((a) => a.kind === "document");
  if (!photo) {
    throw new ValidationError("No verified product photo was found");
  }
  if (!document || !document.parsedText) {
    throw new ValidationError("The product document has no parsed text yet");
  }
  return {
    productName: product.name,
    documentText: document.parsedText,
    photo: { key: photo.storageKey, mimeType: photo.mimeType },
  };
}
