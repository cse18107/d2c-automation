import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { v7 } from "uuid";
import { AD_COPY_LIMITS, LISTING_LIMITS } from "@/schemas/limits";
import { adCopySchema, marketplaceListingSchema } from "@/schemas/listing-text";
import type { PkrBody } from "@/schemas/pkr";
import {
  adCopyJsonSchema,
  marketplaceJsonSchema,
} from "@/server/ai/json-schemas";
import { loadPrompt, PROMPT_IDS } from "@/server/ai/prompts";
import { callStructured } from "@/server/ai/structured";
import { listingTexts } from "@/server/db/schema";
import { withOrg } from "@/server/db/with-org";
import {
  checkCopy,
  hasBlockingFinding,
  type PolicyFinding,
} from "@/server/policy/rules";
import { TEXT_IMAGE_CALL_CEILING_MINOR } from "../budget";
import { nextVersion } from "../versioning";
import { paidCall, type StageContext } from "./context";
import { sha256Hex } from "./persist";

type Target = "marketplace" | "ad_copy";

async function saveListing(
  ctx: StageContext,
  input: {
    target: Target;
    body: object;
    text: string;
    findings: PolicyFinding[];
    modelId: string;
    promptVersion: string;
    costMinor: number;
    pkrId: string | null;
  },
): Promise<string> {
  const { orgId, productId } = ctx.scope;
  const existing = await ctx.db
    .select({ version: listingTexts.version })
    .from(listingTexts)
    .where(
      and(
        withOrg(listingTexts, orgId),
        eq(listingTexts.productId, productId),
        eq(listingTexts.target, input.target),
      ),
    )
    .orderBy(desc(listingTexts.version));
  const id = v7();
  await ctx.db.insert(listingTexts).values({
    id,
    orgId,
    productId,
    pkrId: input.pkrId,
    target: input.target,
    version: nextVersion(existing.map((r) => r.version)),
    status: hasBlockingFinding(input.findings) ? "blocked" : "pending_review",
    body: input.body,
    modelId: input.modelId,
    promptVersion: input.promptVersion,
    inputHash: sha256Hex(new TextEncoder().encode(input.text)),
    costMinor: input.costMinor,
    currency: "USD",
    policyFindings: input.findings,
  });
  return id;
}

// Marketplace listing text and ad copy. Each is checked by policy before it can
// reach review. A blocked text is stored with its findings, not dropped.
export async function generateListingsStage(
  ctx: StageContext,
  input: { pkr: PkrBody; pkrId: string },
): Promise<string[]> {
  const pkrContext = `PKR:\n${JSON.stringify(input.pkr)}`;

  const listingSystem = await loadPrompt(PROMPT_IDS.listingText);
  const listingModel = ctx.models.text;
  const listing = await paidCall(ctx, {
    purpose: "listing_text",
    promptVersion: PROMPT_IDS.listingText,
    modelId: listingModel,
    ceilingMinor: TEXT_IMAGE_CALL_CEILING_MINOR,
    run: async () => {
      const result = await callStructured(ctx.ai, {
        modelId: listingModel,
        system: listingSystem,
        user: `Limits: title ${LISTING_LIMITS.titleMax} characters; ${LISTING_LIMITS.bulletCount} bullets of ${LISTING_LIMITS.bulletMax} characters; description ${LISTING_LIMITS.descriptionMax} characters; up to ${LISTING_LIMITS.keywordCount} keywords.\n${pkrContext}`,
        schemaName: "marketplace_listing",
        jsonSchema: marketplaceJsonSchema,
        parse: marketplaceListingSchema,
      });
      return { value: result.value, costMinor: result.costMinor };
    },
  });
  const listingText = [
    listing.value.title,
    ...listing.value.bullets,
    listing.value.description,
    ...listing.value.keywords,
  ].join("\n");
  const listingId = await saveListing(ctx, {
    target: "marketplace",
    body: listing.value,
    text: listingText,
    findings: checkCopy({ text: listingText, pkr: input.pkr }),
    modelId: listingModel,
    promptVersion: PROMPT_IDS.listingText,
    costMinor: listing.chargedMinor,
    pkrId: input.pkrId,
  });

  const adSystem = await loadPrompt(PROMPT_IDS.adCopy);
  const ad = await paidCall(ctx, {
    purpose: "ad_copy",
    promptVersion: PROMPT_IDS.adCopy,
    modelId: listingModel,
    ceilingMinor: TEXT_IMAGE_CALL_CEILING_MINOR,
    run: async () => {
      const result = await callStructured(ctx.ai, {
        modelId: listingModel,
        system: adSystem,
        user: `Limits: ${AD_COPY_LIMITS.headlineCount} headlines of ${AD_COPY_LIMITS.headlineMax} characters; ${AD_COPY_LIMITS.primaryTextCount} primary texts of ${AD_COPY_LIMITS.primaryTextMax} characters; up to ${AD_COPY_LIMITS.hashtagCount} hashtags.\n${pkrContext}`,
        schemaName: "ad_copy",
        jsonSchema: adCopyJsonSchema,
        parse: adCopySchema,
      });
      return { value: result.value, costMinor: result.costMinor };
    },
  });
  const adText = [
    ...ad.value.headlines,
    ...ad.value.primaryTexts,
    ...ad.value.hashtags,
  ].join("\n");
  const adId = await saveListing(ctx, {
    target: "ad_copy",
    body: ad.value,
    text: adText,
    findings: checkCopy({ text: adText, pkr: input.pkr }),
    modelId: listingModel,
    promptVersion: PROMPT_IDS.adCopy,
    costMinor: ad.chargedMinor,
    pkrId: input.pkrId,
  });
  return [listingId, adId];
}
