# 0004 — Video generation from a product photo, and ffmpeg

## Status
Accepted (Step 02, Content Generation Using AI). Partly verified; see "Not yet verified".

## Context
Each product gets 2–3 short real-life-use-case videos (6–15 s), generated from the product photo. Video generation is asynchronous and paid. Post-processing needs ffmpeg (CLAUDE.md §3, §8).

## Decision
- **Image-to-video.** The user's photo is the first frame: `frame_images: [{ type: "image_url", image_url: { url }, frame_type: "first_frame" }]` with a prompt, `resolution: "720p"`, `aspect_ratio: "9:16"`, `generate_audio: false`. `prompt` is always sent.
- **Submit and poll.** `POST /api/v1/videos` returns 202 with `id`, `polling_url`, `status: pending`. We poll `GET /api/v1/videos/{id}` every 30 s from a durable step (`step.sleep`), not from a request handler. Terminal states are `completed`, `failed`, `cancelled`, `expired`. Download uses `unsigned_urls[0]` (or `GET /api/v1/videos/{id}/content?index=0`) with our key, and the bytes are stored in our bucket with a `sha256`. Webhooks are not used.
- **Idempotency.** A `video_jobs` row with a `provider_job_id` is never resubmitted. A retry after a failed poll reads the existing job, so a single paid submit is never duplicated.
- **Default model `alibaba/wan-3.0`:** image-to-video with `first_frame`, duration 2–30 s (so 6–15 s needs no snapping), 720p at $0.10 per second.
- **Fallback `google/veo-3.1-lite`:** first and last frame, durations only 4, 6 or 8 s. A 15 s request is rejected before submit, never snapped silently.
- **Duration and resolution rules** live in `src/server/video/duration-rules.ts`. An unknown model or an unsupported value is a `VALIDATION` error before any paid call.
- **Master is 9:16.** The 1:1 variant is a centre crop. The 16:9 variant is letterboxed with a blurred background, never cropped, so the product is not cut out of frame.
- **ffmpeg** is a system binary at `FFMPEG_PATH` (default `ffmpeg`). It is run with `execFile` and an argument array built by a pure function (`src/server/video/ffmpeg-args.ts`). No shell string is built, and no npm wrapper is added. Burned captions use text from the PKR only, escaped for drawtext.
- **Privacy.** Video generation is not eligible for Zero Data Retention, so `zdr: true` is never sent for video. Product photos and PKR text go to the provider. This was approved (spec Q13), and the confirmation dialog shows it.
- **Spend.** Estimate = count × duration × per-second rate (integer cents, rounded up). The cap is checked before every submit. A failed job is charged the `usage.cost` it reports.

## Consequences
- Fidelity check (LLM over sampled frames) is the control for distorted product shape, logo or text. A `rejected` video cannot reach review.
- Provider-hosted URLs (`unsigned_urls`, `urls`) are never sent to the client or logged.
- A system `ffmpeg` is a local and CI prerequisite. Tests that need the binary are skipped with an explicit report when it is missing.

## Not yet verified (must be checked before the first real run)
- Accepted image formats and size limits for `frame_images`, and whether a data URL is accepted. Until checked, the image is sent as a short-TTL signed URL, and the ADR is updated with the fetch timing from a smoke test.
- Whether the provider fetches the image at submit time or later, which decides whether a 5-min signed URL is long enough.
- Per-second rates in this ADR come from the models docs fetched on 2026-11-25. They are re-read from `pricing_skus` at estimate time.

## Related
- ADR 0003 (gateway)
- Spec `.claude/specs/02-content-generation-using-ai.md` §2, §5, §7, §8, §13a.

## Update (2026-11-25): first frame sent inline
The provider rejected a localhost signed URL ("Localhost URLs are not allowed"). The provider fetches reference URLs itself, and the local MinIO storage is not reachable from outside. The first frame is now sent inline as a base64 `data:image/jpeg` URL. The docs do not say whether the video endpoint accepts data URLs, so this is unconfirmed. If it rejects them, the photo must be served from a public URL (for example a public R2 bucket).
