import { describe, expect, it } from "vitest";
import { sniffMatchesDeclared, sniffType } from "./magic-bytes";

const enc = (s: string) => new TextEncoder().encode(s);

describe("sniffType", () => {
  it("identifies JPEG, PNG, WebP and PDF by their signatures", () => {
    expect(sniffType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe(
      "image/jpeg",
    );
    expect(
      sniffType(
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]),
      ),
    ).toBe("image/png");
    expect(
      sniffType(new Uint8Array([...enc("RIFF"), 0, 0, 0, 0, ...enc("WEBP")])),
    ).toBe("image/webp");
    expect(sniffType(enc("%PDF-1.7\n"))).toBe("application/pdf");
  });

  it("identifies DOCX as a ZIP that contains word/document.xml", () => {
    const zip = new Uint8Array([
      0x50,
      0x4b,
      0x03,
      0x04,
      ...enc("....word/document.xml...."),
    ]);
    expect(sniffType(zip)).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
  });

  it("treats a ZIP without word/document.xml as not a DOCX", () => {
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...enc("random.bin")]);
    expect(sniffType(zip)).toBeNull();
  });

  it("identifies UTF-8 text, and refuses text containing NUL bytes", () => {
    expect(sniffType(enc("# Ember Mug\nHand glazed."))).toBe("text");
    expect(sniffType(new Uint8Array([0x61, 0x00, 0x62]))).toBeNull();
  });

  it("rejects invalid UTF-8 that is not any other known type", () => {
    expect(sniffType(new Uint8Array([0xc3, 0x28, 0xa0, 0xa1]))).toBeNull();
  });
});

describe("sniffMatchesDeclared", () => {
  it("accepts text for both text/plain and text/markdown", () => {
    expect(sniffMatchesDeclared("text", "text/plain")).toBe(true);
    expect(sniffMatchesDeclared("text", "text/markdown")).toBe(true);
  });

  it("rejects a JPEG declared as PNG", () => {
    expect(sniffMatchesDeclared("image/jpeg", "image/png")).toBe(false);
  });
});
