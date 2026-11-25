import { describe, expect, it } from "vitest";
import { ValidationError } from "@/server/errors";
import {
  assertSafePath,
  captionArgs,
  drawtextFilter,
  escapeDrawtext,
  landscapeLetterboxArgs,
  squareCropArgs,
} from "./ffmpeg-args";

describe("escapeDrawtext", () => {
  it("escapes characters that drawtext treats as syntax", () => {
    expect(escapeDrawtext("50% off: 'best'")).toBe("50\\% off\\: \\'best\\'");
  });

  it("escapes backslashes first so they are not doubled twice", () => {
    expect(escapeDrawtext("a\\b")).toBe("a\\\\b");
  });
});

describe("paths", () => {
  it("rejects a path that would be read as an ffmpeg option", () => {
    expect(() => assertSafePath("-i")).toThrow(ValidationError);
    expect(() => assertSafePath("")).toThrow(ValidationError);
  });
});

describe("squareCropArgs", () => {
  it("returns an argument array with no shell metacharacters in the paths", () => {
    const args = squareCropArgs("/tmp/job/master.mp4", "/tmp/job/square.mp4");
    expect(args).toContain("/tmp/job/master.mp4");
    expect(args).toContain("/tmp/job/square.mp4");
    expect(args).toContain("-an");
  });

  it("escapes the commas inside min() for the filter parser", () => {
    const args = squareCropArgs("in.mp4", "out.mp4");
    const vf = args[args.indexOf("-vf") + 1];
    expect(vf).toBe("crop=min(iw\\,ih):min(iw\\,ih),scale=1080:1080");
  });
});

describe("landscapeLetterboxArgs", () => {
  it("builds a blurred background with the sharp frame on top, never a crop of the product", () => {
    const args = landscapeLetterboxArgs("in.mp4", "out.mp4");
    const filter = args[args.indexOf("-filter_complex") + 1] ?? "";
    expect(filter).toContain("boxblur");
    expect(filter).toContain("overlay=(W-w)/2:(H-h)/2");
    expect(filter).toContain("force_original_aspect_ratio=decrease");
  });
});

describe("drawtextFilter and captionArgs", () => {
  it("shows each caption only inside its own time window", () => {
    const filter = drawtextFilter({
      text: "Keeps skin hydrated",
      fontFile: "/fonts/Inter.ttf",
      startSeconds: 0,
      endSeconds: 2,
    });
    expect(filter).toContain("enable='between(t,0,2)'");
    expect(filter).toContain("text='Keeps skin hydrated'");
  });

  it("rejects a caption that ends before it starts", () => {
    expect(() =>
      drawtextFilter({
        text: "x",
        fontFile: "/f.ttf",
        startSeconds: 3,
        endSeconds: 1,
      }),
    ).toThrow(ValidationError);
  });

  it("chains every caption into one video filter", () => {
    const args = captionArgs({
      source: "master.mp4",
      output: "captioned.mp4",
      fontFile: "/f.ttf",
      captions: [
        { text: "One", startSeconds: 0, endSeconds: 2 },
        { text: "Two", startSeconds: 2, endSeconds: 4 },
      ],
    });
    const vf = args[args.indexOf("-vf") + 1] ?? "";
    expect(vf.split(",drawtext=")).toHaveLength(2);
  });

  it("requires at least one caption", () => {
    expect(() =>
      captionArgs({
        source: "a.mp4",
        output: "b.mp4",
        fontFile: "/f.ttf",
        captions: [],
      }),
    ).toThrow(ValidationError);
  });
});
