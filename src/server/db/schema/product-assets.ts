import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { ASSET_KINDS } from "../../../schemas/product-asset";
import { idColumn, orgIdColumn, timestamps } from "./columns";

export const assetKindEnum = pgEnum("asset_kind", ASSET_KINDS);

export const productAssets = pgTable(
  "product_assets",
  {
    id: idColumn(),
    orgId: orgIdColumn(),
    productId: uuid("product_id").notNull(),
    kind: assetKindEnum("kind").notNull(),
    storageKey: text("storage_key").notNull(),
    originalFilename: text("original_filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    width: integer("width"),
    height: integer("height"),
    exifStripped: boolean("exif_stripped").notNull().default(false),
    parsedText: text("parsed_text"),
    sortOrder: integer("sort_order").notNull().default(0),
    // Null until the server verifies the upload (magic bytes, size). Added beyond the
    // spec's field list because the upload ticket creates the row before the bytes arrive.
    verifiedAt: timestamp("verified_at", {
      withTimezone: true,
      mode: "string",
    }),
    ...timestamps,
  },
  (t) => [index("product_assets_product_idx").on(t.productId)],
);
