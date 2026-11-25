import { describe, expect, it } from "vitest";
import { ValidationError } from "@/server/errors";
import {
  assertCountAllows,
  MAX_FILE_BYTES,
  validateUploadRequest,
} from "./rules";

const image = (
  overrides: Partial<{
    filename: string;
    mimeType: string;
    sizeBytes: number;
  }> = {},
) => ({
  kind: "image" as const,
  filename: "mug.webp",
  mimeType: "image/webp",
  sizeBytes: 1000,
  ...overrides,
});

describe("validateUploadRequest", () => {
  it("accepts each allowed image type with a matching extension", () => {
    expect(() => validateUploadRequest(image())).not.toThrow();
    expect(() =>
      validateUploadRequest(
        image({ filename: "a.jpg", mimeType: "image/jpeg" }),
      ),
    ).not.toThrow();
    expect(() =>
      validateUploadRequest(
        image({ filename: "a.png", mimeType: "image/png" }),
      ),
    ).not.toThrow();
  });

  it("accepts each allowed document type", () => {
    const docs: [string, string][] = [
      ["a.pdf", "application/pdf"],
      [
        "a.docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ],
      ["a.txt", "text/plain"],
      ["a.md", "text/markdown"],
    ];
    for (const [filename, mimeType] of docs) {
      expect(() =>
        validateUploadRequest({
          kind: "document",
          filename,
          mimeType,
          sizeBytes: 10,
        }),
      ).not.toThrow();
    }
  });

  it("rejects a disallowed MIME type for the kind", () => {
    expect(() =>
      validateUploadRequest(
        image({ mimeType: "image/gif", filename: "a.gif" }),
      ),
    ).toThrow(ValidationError);
    expect(() =>
      validateUploadRequest({
        kind: "document",
        filename: "a.png",
        mimeType: "image/png",
        sizeBytes: 10,
      }),
    ).toThrow(ValidationError);
  });

  it("rejects an extension that disagrees with the MIME type", () => {
    expect(() => validateUploadRequest(image({ filename: "mug.png" }))).toThrow(
      /extension/,
    );
  });

  it("accepts exactly 10 MB and rejects one byte more", () => {
    expect(() =>
      validateUploadRequest(image({ sizeBytes: MAX_FILE_BYTES })),
    ).not.toThrow();
    expect(() =>
      validateUploadRequest(image({ sizeBytes: MAX_FILE_BYTES + 1 })),
    ).toThrow(/10 MB/);
  });

  it("rejects an empty file", () => {
    expect(() => validateUploadRequest(image({ sizeBytes: 0 }))).toThrow(
      /empty/,
    );
  });
});

describe("assertCountAllows", () => {
  it("allows up to 10 images", () => {
    expect(() => assertCountAllows("image", 9)).not.toThrow();
    expect(() => assertCountAllows("image", 10)).toThrow(ValidationError);
  });

  it("allows one document", () => {
    expect(() => assertCountAllows("document", 0)).not.toThrow();
    expect(() => assertCountAllows("document", 1)).toThrow(ValidationError);
  });
});
