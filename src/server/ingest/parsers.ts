import "server-only";
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import { logger } from "@/lib/logger";
import { DOCX_MIME } from "@/schemas/product-asset";
import { PermanentError, ValidationError } from "@/server/errors";
import { MAX_PDF_PAGES } from "@/server/uploads/rules";

// Limits from spec §9 and §12. A parser that runs past this is treated as a
// permanent failure, so the job fails instead of retrying forever.
export const PARSE_TIMEOUT_MS = 60_000;

export type ParsedDocument = { text: string; pages: number | null };

// Document text is untrusted data (CLAUDE.md §12). It is returned as a plain
// string and stored; it never influences control flow.
export async function parseDocument(
  mimeType: string,
  bytes: Uint8Array,
): Promise<ParsedDocument> {
  return withTimeout(parseByMime(mimeType, bytes), PARSE_TIMEOUT_MS);
}

async function parseByMime(
  mimeType: string,
  bytes: Uint8Array,
): Promise<ParsedDocument> {
  if (mimeType === "application/pdf") return parsePdf(bytes);
  if (mimeType === DOCX_MIME) return parseDocx(bytes);
  if (mimeType === "text/plain" || mimeType === "text/markdown") {
    return ensureText({
      text: new TextDecoder("utf-8").decode(bytes),
      pages: null,
    });
  }
  throw new ValidationError(`${mimeType} cannot be parsed`);
}

async function parsePdf(bytes: Uint8Array): Promise<ParsedDocument> {
  const proxy = await getDocumentProxy(bytes).catch((error: unknown) => {
    logger.warn({ err: error }, "pdf could not be opened");
    throw new PermanentError("The PDF could not be opened");
  });
  const pages = proxy.numPages;
  if (pages > MAX_PDF_PAGES) {
    throw new ValidationError(`PDFs can have at most ${MAX_PDF_PAGES} pages`);
  }
  const { text } = await extractText(proxy, { mergePages: true }).catch(
    (error: unknown) => {
      logger.warn({ err: error }, "pdf text extraction failed");
      throw new PermanentError("The PDF text could not be read");
    },
  );
  return ensureText({ text, pages });
}

async function parseDocx(bytes: Uint8Array): Promise<ParsedDocument> {
  const result = await mammoth
    .extractRawText({ buffer: Buffer.from(bytes) })
    .catch((error: unknown) => {
      logger.warn({ err: error }, "docx text extraction failed");
      throw new PermanentError("The Word document could not be read");
    });
  return ensureText({ text: result.value, pages: null });
}

function ensureText(parsed: ParsedDocument): ParsedDocument {
  const text = parsed.text.replaceAll(String.fromCharCode(0), "").trim();
  if (text.length === 0) {
    // Scanned PDFs need vision OCR (CLAUDE.md §8), which is not built yet.
    throw new PermanentError(
      "No readable text was found. Scanned documents are not supported yet.",
    );
  }
  return { text, pages: parsed.pages };
}

async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new PermanentError("Parsing took too long")),
      ms,
    );
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
