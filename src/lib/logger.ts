import "server-only";
import pino from "pino";

// Redact anything that grants access: signed URLs, storage keys and credentials.
// Logs are structured JSON; no console.log (CLAUDE.md §13).
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: "d2c-autopilot" },
  redact: {
    paths: [
      "authorization",
      "cookie",
      "*.authorization",
      "*.cookie",
      "url",
      "*.url",
      "uploadUrl",
      "*.uploadUrl",
      "downloadUrl",
      "*.downloadUrl",
      "storageKey",
      "*.storageKey",
      "*.secretAccessKey",
      "*.accessKeyId",
    ],
    censor: "[redacted]",
  },
});
