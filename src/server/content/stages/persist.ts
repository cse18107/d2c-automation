import "server-only";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { v7 } from "uuid";
import type { Json } from "@/schemas/json";
import { creativeRenders, creatives } from "@/server/db/schema";
import { nextVersion } from "../versioning";
import type { StageContext } from "./context";

export type NewRender = {
  variant: string;
  bytes: Uint8Array;
  mediaType: string;
  width: number | null;
  height: number | null;
};

export type NewCreative = {
  slot: string;
  kind: "image" | "video";
  status: "running" | "generated" | "blocked" | "pending_review" | "failed";
  modelId: string;
  promptVersion: string;
  inputHash: string;
  costMinor: number;
  durationSeconds?: number | null;
  providerJobId?: string | null;
  providerStatus?: string | null;
  storyboard?: Json | null;
  policyFindings: Json;
  errorMessage?: string | null;
};

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

// Storage key for a generated file. Server-generated ids only (spec §8).
export function renderKey(
  orgId: string,
  productId: string,
  creativeId: string,
  variant: string,
  mediaType: string,
): string {
  const ext = mediaType === "video/mp4" ? "mp4" : "jpg";
  return `${orgId}/${productId}/generated/${creativeId}/${variant.replace(":", "x")}.${ext}`;
}

// Writes a creative and its files. Files go to storage first, then the rows are
// written in one transaction. The version is the next one for this slot.
export async function saveCreative(
  ctx: StageContext,
  input: NewCreative,
  renders: NewRender[],
): Promise<string> {
  const { orgId, productId } = ctx.scope;
  const id = v7();

  const uploads = await Promise.all(
    renders.map(async (render) => {
      const key = renderKey(
        orgId,
        productId,
        id,
        render.variant,
        render.mediaType,
      );
      await ctx.storage.writeObject(key, render.bytes, render.mediaType);
      return { render, key };
    }),
  );

  await ctx.db.transaction(async (tx) => {
    const existing = await tx
      .select({ version: creatives.version })
      .from(creatives)
      .where(
        and(
          eq(creatives.orgId, orgId),
          eq(creatives.productId, productId),
          eq(creatives.kind, input.kind),
          eq(creatives.slot, input.slot),
        ),
      );
    await tx.insert(creatives).values({
      id,
      orgId,
      productId,
      kind: input.kind,
      slot: input.slot,
      version: nextVersion(existing.map((r) => r.version)),
      status: input.status,
      modelId: input.modelId,
      promptVersion: input.promptVersion,
      inputHash: input.inputHash,
      durationSeconds: input.durationSeconds ?? null,
      providerJobId: input.providerJobId ?? null,
      providerStatus: input.providerStatus ?? null,
      storyboard: input.storyboard ?? null,
      costMinor: input.costMinor,
      policyFindings: input.policyFindings,
      errorMessage: input.errorMessage ?? null,
    });
    for (const { render, key } of uploads) {
      await tx.insert(creativeRenders).values({
        orgId,
        creativeId: id,
        variant: render.variant,
        storageKey: key,
        mediaType: render.mediaType,
        width: render.width,
        height: render.height,
        bytes: render.bytes.byteLength,
        sha256: sha256Hex(render.bytes),
      });
    }
  });
  return id;
}
