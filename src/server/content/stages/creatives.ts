import "server-only";
import type { ImageSlot } from "@/schemas/creative";
import { IMAGE_SLOTS } from "@/schemas/creative";
import type { PkrBody } from "@/schemas/pkr";
import { IMAGE_PROMPT_IDS } from "@/server/ai/prompts";
import { buildProductFacts } from "@/server/creatives/product-facts";
import {
  AD_RATIOS,
  type AdRatio,
  renderAdRatios,
  renderMainWhite,
} from "@/server/creatives/render";
import { getSlotPrompt } from "@/server/creatives/slot-prompts";
import { AppError } from "@/server/errors";
import { TEXT_IMAGE_CALL_CEILING_MINOR } from "../budget";
import { SpendCapError } from "../cost";
import { paidCall, type StageContext } from "./context";
import type { PhotoRef } from "./load";
import { type NewRender, saveCreative, sha256Hex } from "./persist";

export type CreativesStageResult = {
  creativeIds: string[];
  failedSlots: ImageSlot[];
};

const AD_RATIO_KEYS = Object.keys(AD_RATIOS) as AdRatio[];

function toRender(render: {
  variant: string;
  bytes: Uint8Array;
  mediaType: string;
  width: number;
  height: number;
}): NewRender {
  return {
    variant: render.variant,
    bytes: render.bytes,
    mediaType: render.mediaType,
    width: render.width,
    height: render.height,
  };
}

// The slot's fixed prompt, followed by the product facts from the document. The
// facts tell the model what the product is made of and how it is sized; they do
// not change the slot's scene.
export function composeImagePrompt(slotPrompt: string, pkr: PkrBody): string {
  return `${slotPrompt}\n\nProduct facts from the product document (use these, add nothing else):\n${buildProductFacts(pkr)}`;
}

// One image slot: the composed prompt and the user's photo go to the image-edit
// model, and the result is cropped to every ad size. No text-model call is made.
async function generateSlot(
  ctx: StageContext,
  pkr: PkrBody,
  photo: PhotoRef,
  photoBytes: Uint8Array,
  slot: ImageSlot,
): Promise<string> {
  const { prompt: slotPrompt, promptVersion } = await getSlotPrompt(slot);
  const prompt = composeImagePrompt(slotPrompt, pkr);
  const image = await paidCall(ctx, {
    purpose: "creative_image",
    promptVersion,
    modelId: ctx.models.imageEdit,
    ceilingMinor: TEXT_IMAGE_CALL_CEILING_MINOR,
    run: async () => {
      const generated = await ctx.ai.generateImage({
        modelId: ctx.models.imageEdit,
        prompt,
        inputImages: [
          {
            mediaType: photo.mimeType,
            base64: Buffer.from(photoBytes).toString("base64"),
          },
        ],
        aspectRatio: "1:1",
      });
      return { value: generated, costMinor: generated.costMinor };
    },
  });

  const master = new Uint8Array(Buffer.from(image.value.base64, "base64"));
  const renders = await renderAdRatios(master, AD_RATIO_KEYS);
  return saveCreative(
    ctx,
    {
      slot,
      kind: "image",
      status: "generated",
      modelId: ctx.models.imageEdit,
      promptVersion,
      // Hash of the exact prompt, so a changed PKR or prompt file is visible.
      inputHash: sha256Hex(new TextEncoder().encode(prompt)),
      costMinor: image.chargedMinor,
      policyFindings: [],
    },
    renders.map(toRender),
  );
}

// The white main image (no model) and the requested image slots. One slot failing
// is recorded and the rest continue. A spend-cap hit stops the whole stage.
export async function generateCreativesStage(
  ctx: StageContext,
  input: { pkr: PkrBody; photo: PhotoRef; slots?: readonly string[] },
): Promise<CreativesStageResult> {
  const photoBytes = await ctx.storage.readObject(input.photo.key);
  const creativeIds: string[] = [];
  const failedSlots: ImageSlot[] = [];
  const wanted = input.slots;

  if (wanted === undefined || wanted.includes("main_white")) {
    const main = await renderMainWhite(photoBytes);
    creativeIds.push(
      await saveCreative(
        ctx,
        {
          slot: "main_white",
          kind: "image",
          status: "generated",
          modelId: "sharp",
          promptVersion: "none",
          inputHash: sha256Hex(photoBytes),
          costMinor: 0,
          policyFindings: [],
        },
        [toRender(main)],
      ),
    );
  }

  for (const slot of IMAGE_SLOTS) {
    if (wanted !== undefined && !wanted.includes(slot)) continue;
    try {
      creativeIds.push(
        await generateSlot(ctx, input.pkr, input.photo, photoBytes, slot),
      );
    } catch (error: unknown) {
      if (error instanceof SpendCapError) throw error;
      if (!(error instanceof AppError)) throw error;
      failedSlots.push(slot);
      await saveCreative(
        ctx,
        {
          slot,
          kind: "image",
          status: "failed",
          modelId: ctx.models.imageEdit,
          promptVersion: IMAGE_PROMPT_IDS[slot],
          inputHash: sha256Hex(photoBytes),
          costMinor: 0,
          policyFindings: [],
          errorMessage: error.message,
        },
        [],
      );
    }
  }
  return { creativeIds, failedSlots };
}
