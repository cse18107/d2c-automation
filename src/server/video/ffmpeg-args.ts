import "server-only";
import { ValidationError } from "@/server/errors";

// Pure builders for ffmpeg argument arrays (ADR 0004). They are run with
// execFile, never through a shell, so no string here is ever interpreted by sh.
// Tests check the arrays without running ffmpeg.

const MASTER_WIDTH = 1080;
const MASTER_HEIGHT = 1920;

export function assertSafePath(path: string): string {
  // A leading "-" would be read as an ffmpeg option. Paths come from our own
  // temp directory, so anything else is a bug.
  if (path.length === 0 || path.startsWith("-") || path.includes("\0")) {
    throw new ValidationError("Unsafe file path for ffmpeg");
  }
  return path;
}

// Escapes text for drawtext. The text comes from PKR facts only.
export function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/:/g, "\\:")
    .replace(/%/g, "\\%")
    .replace(/\n/g, " ");
}

export function drawtextFilter(input: {
  text: string;
  fontFile: string;
  startSeconds: number;
  endSeconds: number;
}): string {
  if (input.endSeconds <= input.startSeconds) {
    throw new ValidationError("Caption end must be after its start");
  }
  const font = assertSafePath(input.fontFile).replace(/:/g, "\\:");
  return [
    `drawtext=fontfile=${font}`,
    `text='${escapeDrawtext(input.text)}'`,
    "x=(w-text_w)/2",
    "y=h-text_h-160",
    "fontsize=56",
    "fontcolor=white",
    "borderw=4",
    "bordercolor=black",
    `enable='between(t,${input.startSeconds},${input.endSeconds})'`,
  ].join(":");
}

// 1:1 centre crop of the 9:16 master. min(iw,ih) keeps the crop square; the
// commas inside min() are escaped for the filter parser.
export function squareCropArgs(input: string, output: string): string[] {
  return [
    "-y",
    "-i",
    assertSafePath(input),
    "-vf",
    "crop=min(iw\\,ih):min(iw\\,ih),scale=1080:1080",
    "-an",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    assertSafePath(output),
  ];
}

// 16:9 letterbox with a blurred copy of the frame behind. The product is never
// cropped (ADR 0004). Output is 1280x720.
export function landscapeLetterboxArgs(
  input: string,
  output: string,
): string[] {
  const filter = [
    "[0:v]split=2[bg][fg]",
    "[bg]scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,boxblur=20:1[blurred]",
    "[fg]scale=1280:720:force_original_aspect_ratio=decrease[sharp]",
    "[blurred][sharp]overlay=(W-w)/2:(H-h)/2",
  ].join(";");
  return [
    "-y",
    "-i",
    assertSafePath(input),
    "-filter_complex",
    filter,
    "-an",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    assertSafePath(output),
  ];
}

// Burns captions into the 9:16 master. `captions` are PKR-derived and already
// length-limited by the schema. Each caption shows for its own window.
export function captionArgs(input: {
  source: string;
  output: string;
  fontFile: string;
  captions: readonly {
    text: string;
    startSeconds: number;
    endSeconds: number;
  }[];
}): string[] {
  if (input.captions.length === 0) {
    throw new ValidationError("At least one caption is required");
  }
  const filter = input.captions
    .map((c) =>
      drawtextFilter({
        text: c.text,
        fontFile: input.fontFile,
        startSeconds: c.startSeconds,
        endSeconds: c.endSeconds,
      }),
    )
    .join(",");
  return [
    "-y",
    "-i",
    assertSafePath(input.source),
    "-vf",
    filter,
    "-an",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    assertSafePath(input.output),
  ];
}

export const MASTER_DIMENSIONS = {
  width: MASTER_WIDTH,
  height: MASTER_HEIGHT,
} as const;
