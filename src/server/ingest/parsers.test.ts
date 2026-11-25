import { describe, expect, it } from "vitest";
import { PermanentError, ValidationError } from "@/server/errors";
import { parseDocument } from "./parsers";

const enc = (s: string) => new TextEncoder().encode(s);

describe("parseDocument", () => {
  it("returns trimmed text for a plain text document", async () => {
    const result = await parseDocument(
      "text/plain",
      enc("  Ember Ceramic Mug 350ml\nDishwasher safe.  "),
    );
    expect(result.text).toBe("Ember Ceramic Mug 350ml\nDishwasher safe.");
    expect(result.pages).toBeNull();
  });

  it("returns text for markdown too", async () => {
    const result = await parseDocument(
      "text/markdown",
      enc("# Mug\nHand glazed."),
    );
    expect(result.text).toContain("Hand glazed.");
  });

  it("fails permanently when the document has no readable text", async () => {
    await expect(
      parseDocument("text/plain", enc("   \n\t  ")),
    ).rejects.toBeInstanceOf(PermanentError);
  });

  it("rejects a MIME type the parser does not handle", async () => {
    await expect(parseDocument("image/png", enc("x"))).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});
