import "server-only";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { PermanentError } from "@/server/errors";
import {
  captionArgs,
  landscapeLetterboxArgs,
  squareCropArgs,
} from "./ffmpeg-args";

const run = promisify(execFile);
const FFMPEG_TIMEOUT_MS = 180_000;

export type PostProcessed = {
  master: Uint8Array; // 9:16 with captions
  square: Uint8Array; // 1:1 centre crop
  landscape: Uint8Array; // 16:9 letterbox
};

// Checks the binary before any paid video call (ADR 0004). A missing ffmpeg is
// found first, so no video is paid for and then lost.
export async function checkFfmpeg(ffmpegPath: string): Promise<void> {
  try {
    await run(ffmpegPath, ["-version"], { timeout: 10_000 });
  } catch {
    throw new PermanentError(
      "ffmpeg was not found. Install it (for example: brew install ffmpeg) or set FFMPEG_PATH.",
    );
  }
}

async function ffmpeg(ffmpegPath: string, args: string[]): Promise<void> {
  try {
    await run(ffmpegPath, args, {
      timeout: FFMPEG_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
    });
  } catch {
    // The stderr can contain file paths and prompt-derived captions. Keep it out
    // of errors and logs.
    throw new PermanentError("Video post-processing failed");
  }
}

// Caption windows split the clip evenly, one caption per scene (three scenes).
function captionWindows(durationSeconds: number, captions: readonly string[]) {
  const step = durationSeconds / captions.length;
  return captions.map((text, i) => ({
    text,
    startSeconds: Number((i * step).toFixed(2)),
    endSeconds: Number(((i + 1) * step).toFixed(2)),
  }));
}

export async function postProcessVideo(input: {
  ffmpegPath: string;
  fontFile: string;
  master: Uint8Array;
  captions: readonly string[];
  durationSeconds: number;
}): Promise<PostProcessed> {
  const dir = await mkdtemp(join(tmpdir(), "d2c-video-"));
  try {
    const source = join(dir, "source.mp4");
    const captioned = join(dir, "captioned.mp4");
    const square = join(dir, "square.mp4");
    const landscape = join(dir, "landscape.mp4");
    await writeFile(source, input.master);

    await ffmpeg(
      input.ffmpegPath,
      captionArgs({
        source,
        output: captioned,
        fontFile: input.fontFile,
        captions: captionWindows(input.durationSeconds, input.captions),
      }),
    );
    await ffmpeg(input.ffmpegPath, squareCropArgs(captioned, square));
    await ffmpeg(
      input.ffmpegPath,
      landscapeLetterboxArgs(captioned, landscape),
    );

    return {
      master: new Uint8Array(await readFile(captioned)),
      square: new Uint8Array(await readFile(square)),
      landscape: new Uint8Array(await readFile(landscape)),
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
