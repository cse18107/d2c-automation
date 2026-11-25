import { DOCX_MIME } from "@/schemas/product-asset";

// What the bytes actually are, independent of the declared MIME type.
// "text" covers text/plain and text/markdown: both are UTF-8 with no NUL bytes.
export type SniffedType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "application/pdf"
  | typeof DOCX_MIME
  | "text";

const ASCII = (s: string) => new TextEncoder().encode(s);

function startsWith(
  bytes: Uint8Array,
  prefix: ArrayLike<number>,
  offset = 0,
): boolean {
  return Array.from(prefix).every((byte, i) => bytes[offset + i] === byte);
}

function containsAscii(bytes: Uint8Array, needle: string): boolean {
  const pattern = ASCII(needle);
  outer: for (let i = 0; i + pattern.length <= bytes.length; i++) {
    for (let j = 0; j < pattern.length; j++) {
      if (bytes[i + j] !== pattern[j]) continue outer;
    }
    return true;
  }
  return false;
}

function isUtf8Text(bytes: Uint8Array): boolean {
  // Control bytes other than tab, LF, CR, FF and VT mean binary data, even when the
  // bytes happen to be valid UTF-8 (for example a ZIP header without NUL bytes).
  for (const byte of bytes) {
    if (
      byte < 0x20 &&
      byte !== 0x09 &&
      byte !== 0x0a &&
      byte !== 0x0d &&
      byte !== 0x0c &&
      byte !== 0x0b
    ) {
      return false;
    }
  }
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

export function sniffType(bytes: Uint8Array): SniffedType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return "image/png";
  if (startsWith(bytes, ASCII("RIFF")) && startsWith(bytes, ASCII("WEBP"), 8))
    return "image/webp";
  if (startsWith(bytes, ASCII("%PDF-"))) return "application/pdf";
  // DOCX is a ZIP archive; the word/document.xml entry name identifies it.
  if (
    startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) &&
    containsAscii(bytes, "word/document.xml")
  ) {
    return DOCX_MIME;
  }
  if (isUtf8Text(bytes)) return "text";
  return null;
}

export function sniffMatchesDeclared(
  sniffed: SniffedType,
  declaredMime: string,
): boolean {
  if (sniffed === "text")
    return declaredMime === "text/plain" || declaredMime === "text/markdown";
  return sniffed === declaredMime;
}
