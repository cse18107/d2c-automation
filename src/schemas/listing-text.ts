import { z } from "zod";
import { AD_COPY_LIMITS, LISTING_LIMITS } from "./limits";

// Marketplace listing text (spec §2). Limits come from limits.ts so the schema
// and the policy check cannot drift apart.
export const marketplaceListingSchema = z.object({
  title: z.string().min(1).max(LISTING_LIMITS.titleMax),
  bullets: z
    .array(z.string().min(1).max(LISTING_LIMITS.bulletMax))
    .length(LISTING_LIMITS.bulletCount),
  description: z.string().min(1).max(LISTING_LIMITS.descriptionMax),
  keywords: z
    .array(z.string().min(1).max(LISTING_LIMITS.keywordMax))
    .max(LISTING_LIMITS.keywordCount),
  attributes: z.record(z.string().min(1).max(80), z.string().max(200)),
});
export type MarketplaceListing = z.infer<typeof marketplaceListingSchema>;

export const adCopySchema = z.object({
  headlines: z
    .array(z.string().min(1).max(AD_COPY_LIMITS.headlineMax))
    .length(AD_COPY_LIMITS.headlineCount),
  primaryTexts: z
    .array(z.string().min(1).max(AD_COPY_LIMITS.primaryTextMax))
    .length(AD_COPY_LIMITS.primaryTextCount),
  cta: z.enum(["SHOP_NOW", "LEARN_MORE", "BUY_NOW", "GET_OFFER", "SEE_MORE"]),
  hashtags: z
    .array(
      z
        .string()
        .regex(/^#[A-Za-z0-9_]+$/)
        .max(AD_COPY_LIMITS.hashtagMax),
    )
    .max(AD_COPY_LIMITS.hashtagCount),
});
export type AdCopy = z.infer<typeof adCopySchema>;
