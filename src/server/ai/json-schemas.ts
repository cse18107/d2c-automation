// JSON Schema objects sent as response_format for each structured call. They
// mirror the Zod schemas in src/schemas; the Zod parse is the real gate.
const str = { type: "string" } as const;
const nullableStr = { type: ["string", "null"] } as const;
const strList = { type: "array", items: str } as const;

export const pkrJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "name",
    "features",
    "specs",
    "materials",
    "price",
    "claims",
    "audience",
    "tone",
    "missingFields",
  ],
  properties: {
    name: str,
    features: strList,
    specs: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "value"],
        properties: { label: str, value: str },
      },
    },
    materials: strList,
    price: {
      type: ["object", "null"],
      additionalProperties: false,
      required: ["minor", "currency"],
      properties: {
        minor: { type: "integer" },
        currency: { type: "string" },
      },
    },
    claims: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "sourceRef"],
        properties: { text: str, sourceRef: str },
      },
    },
    audience: nullableStr,
    tone: nullableStr,
    missingFields: strList,
  },
} as const;

export const creativeBriefJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["prompt", "overlayText"],
  properties: { prompt: str, overlayText: nullableStr },
} as const;

export const marketplaceJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "bullets", "description", "keywords", "attributes"],
  properties: {
    title: str,
    bullets: { type: "array", items: str, minItems: 5, maxItems: 5 },
    description: str,
    keywords: strList,
    attributes: {
      type: "object",
      additionalProperties: str,
    },
  },
} as const;

export const adCopyJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["headlines", "primaryTexts", "cta", "hashtags"],
  properties: {
    headlines: { type: "array", items: str, minItems: 3, maxItems: 3 },
    primaryTexts: { type: "array", items: str, minItems: 2, maxItems: 2 },
    cta: {
      type: "string",
      enum: ["SHOP_NOW", "LEARN_MORE", "BUY_NOW", "GET_OFFER", "SEE_MORE"],
    },
    hashtags: strList,
  },
} as const;

export const videoStoryboardJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["scenes", "endCardText"],
  properties: {
    scenes: {
      type: "array",
      minItems: 5,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["description", "caption"],
        properties: { description: str, caption: str },
      },
    },
    endCardText: str,
  },
} as const;
