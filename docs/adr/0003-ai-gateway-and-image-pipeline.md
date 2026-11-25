# 0003 — AI gateway and image pipeline

## Status
Accepted (Step 02, Content Generation Using AI). Partly verified; see "Not yet verified".

## Context
Step 02 adds the first AI calls: PKR extraction, creative briefs, listing and ad copy, policy review, image editing, and (ADR 0004) video. CLAUDE.md §8 requires one gateway (OpenRouter), no other provider key, prompts as versioned files, and models chosen from config, never hard-coded in app code.

## Decision
- **One `ModelGateway`** in `src/server/ai/gateway.ts`, using `fetch` against `https://openrouter.ai/api/v1`. No provider SDK is added (spec §13). `OPENROUTER_API_KEY` is read only through `src/lib/env.ts` and is never logged or returned.
- **Text and structured JSON:** `POST /api/v1/chat/completions`, with `response_format: { type: "json_schema", json_schema: { name, strict, schema } }`. Every output is parsed with `safeParse` against a Zod schema. On failure, one retry is sent with the Zod error text appended. A second failure is `VALIDATION` and fails the step (CLAUDE.md §8).
- **Images:** `POST /api/v1/images`, not chat completions. The docs state image-only models are served by this endpoint. Request fields used: `model`, `prompt`, `response_format` (`"b64_json"` so we store the bytes ourselves), `aspect_ratio`, `resolution`. Editing a photo passes it in `input_references` as `{ type: "image_url", image_url: { url } }`.
- **Response:** images are read from `data[]`. Each entry has `b64_json` or `url`. URLs expire after 24 h, so generated images are downloaded and stored in our bucket immediately. `media_type` is kept as the stored MIME type.
- **Billing:** completed generations are billed in full and failed ones are not (OpenRouter docs). Cost is taken from `usage.cost` when present, else from the models endpoint `pricing` for the chosen model. The estimate rounds up to whole minor units so the cap check is conservative.
- **Errors** map to the normalized codes: 401/403 → `PERMANENT` ("AI provider rejected the key"), 404 or model-not-found → `PERMANENT` ("Model unavailable"), 429 → `RATE_LIMITED`, 5xx and network errors → `TRANSIENT`. Response bodies are not copied into error messages, because they can echo prompts.
- **Model IDs** come from config (`AI_TEXT_MODEL_ID`, `AI_IMAGE_MODEL_ID`, `AI_IMAGE_EDIT_MODEL_ID`, `AI_VIDEO_MODEL_ID`, `AI_VIDEO_FALLBACK_MODEL_ID`) with defaults in `src/server/ai/config.ts`. They are recorded on every generated row as `modelId`.
- **Prompts** are files in `src/server/ai/prompts/` named `<name>.v<N>.md`. The loader takes the name and version and never accepts inline text.

## Consequences
- The gateway is the only module that talks to OpenRouter for AI output. Connectors never import it (CLAUDE.md §4). A test asserts this.
- Tests inject a fake `fetch`. CI makes no real AI calls (CLAUDE.md §14).
- Images from editing are not byte-identical to the input photo. The fidelity check (spec §8, Q7) is the control.

## Not yet verified (must be checked before the first real call)
- The structured-output docs page (`/docs/api-reference/structured-outputs`) returned 404 when fetched on 2026-11-25. The `json_schema` shape above is the OpenAI-compatible form and must be confirmed against live docs, and per-model support checked through `supported_parameters`. If a model rejects `json_schema`, fall back to `json_object` and validate with Zod.
- Accepted input image formats and size limits for `input_references`, and whether a base64 data URL is accepted in place of a URL.
- Which text and image models are the defaults (Q5). Choose from the models endpoint, filtered by output modality.

## Related
- ADR 0004 (video and ffmpeg)
- CLAUDE.md §3, §8, §12; spec `.claude/specs/02-content-generation-using-ai.md` §6, §8, §13.
