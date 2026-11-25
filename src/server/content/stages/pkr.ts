import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { v7 } from "uuid";
import { type PkrBody, pkrBodySchema } from "@/schemas/pkr";
import { pkrJsonSchema } from "@/server/ai/json-schemas";
import { loadPrompt, PROMPT_IDS } from "@/server/ai/prompts";
import { callStructured } from "@/server/ai/structured";
import { pkrs } from "@/server/db/schema";
import { withOrg } from "@/server/db/with-org";
import { TEXT_IMAGE_CALL_CEILING_MINOR } from "../budget";
import { paidCall, type StageContext } from "./context";
import { sha256Hex } from "./persist";

// Keeps the document inside a sane prompt size. Longer text is cut, and the
// PKR marks what is missing rather than guessing.
const MAX_DOCUMENT_CHARS = 60_000;

export type PkrStageResult = { pkrId: string; body: PkrBody };

export async function extractPkrStage(
  ctx: StageContext,
  input: { productName: string; documentText: string },
): Promise<PkrStageResult> {
  const { orgId, productId } = ctx.scope;
  const system = await loadPrompt(PROMPT_IDS.pkrExtract);
  const document = input.documentText.slice(0, MAX_DOCUMENT_CHARS);
  const user = `Product name from the brand: ${input.productName}\n<document>\n${document}\n</document>`;
  const modelId = ctx.models.text;

  const { value: body, chargedMinor } = await paidCall(ctx, {
    purpose: "extract_pkr",
    promptVersion: PROMPT_IDS.pkrExtract,
    modelId,
    ceilingMinor: TEXT_IMAGE_CALL_CEILING_MINOR,
    run: async () => {
      const result = await callStructured(ctx.ai, {
        modelId,
        system,
        user,
        schemaName: "product_knowledge_record",
        jsonSchema: pkrJsonSchema,
        parse: pkrBodySchema,
      });
      return {
        value: result.value,
        costMinor: result.costMinor,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      };
    },
  });

  const [latest] = await ctx.db
    .select({ version: pkrs.version })
    .from(pkrs)
    .where(and(withOrg(pkrs, orgId), eq(pkrs.productId, productId)))
    .orderBy(desc(pkrs.version))
    .limit(1);
  const pkrId = v7();
  await ctx.db.insert(pkrs).values({
    id: pkrId,
    orgId,
    productId,
    version: (latest?.version ?? 0) + 1,
    body,
    inputHash: sha256Hex(new TextEncoder().encode(document)),
    promptVersion: PROMPT_IDS.pkrExtract,
    modelId,
    costMinor: chargedMinor,
    currency: "USD",
  });
  return { pkrId, body };
}

// Reuses the newest PKR when there is one, so images and videos do not pay for a
// new extraction each time. The text run extracts a new version on purpose.
export async function ensurePkrStage(
  ctx: StageContext,
  input: { productName: string; documentText: string },
): Promise<PkrStageResult> {
  const { orgId, productId } = ctx.scope;
  const [latest] = await ctx.db
    .select({ id: pkrs.id, body: pkrs.body })
    .from(pkrs)
    .where(and(withOrg(pkrs, orgId), eq(pkrs.productId, productId)))
    .orderBy(desc(pkrs.version))
    .limit(1);
  if (latest) {
    return { pkrId: latest.id, body: pkrBodySchema.parse(latest.body) };
  }
  return extractPkrStage(ctx, input);
}
