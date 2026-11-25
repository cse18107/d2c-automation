import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import { v7 } from "uuid";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { Db } from "@/server/db";
import {
  auditEvents,
  ingestJobs,
  productAssets,
  products,
} from "@/server/db/schema";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import {
  failIngest,
  finalizeIngest,
  type IngestScope,
  loadAndCheckAssets,
  markJobRunning,
  parseDocumentStep,
} from "@/server/ingest/workflow";
import { enqueueIngest } from "@/server/jobs";
import {
  closeDb,
  ORG_A,
  ORG_B,
  resetTestDatabase,
} from "@/test/integration-db";
import { fakeStore } from "@/test/storage-fake";
import { completeAssetUpload, requestAssetUpload } from "./assets";
import { cancelActiveIngest } from "./ingest-control";
import {
  type Actor,
  createProduct,
  deleteDraftProduct,
  getProductDetail,
  listProducts,
  submitForIngest,
} from "./service";

// The storage and queue boundaries are faked so this suite never calls real services.
vi.mock("@/server/storage", () => import("@/test/storage-fake"));
vi.mock("@/server/jobs", () => ({
  enqueueIngest: vi.fn(async () => undefined),
}));

const TEST_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_URL ? describe : describe.skip;

const actorA: Actor = { orgId: ORG_A, userId: "dev-user" };
const actorB: Actor = { orgId: ORG_B, userId: "dev-user" };

let db: Db;

async function jpegBytes(): Promise<Uint8Array> {
  const buffer = await sharp({
    create: {
      width: 900,
      height: 900,
      channels: 3,
      background: { r: 10, g: 90, b: 150 },
    },
  })
    .withExif({ IFD0: { Artist: "Photographer Name" } })
    .jpeg()
    .toBuffer();
  return new Uint8Array(buffer);
}

const textBytes = (s: string) => new TextEncoder().encode(s);

// Mirrors the browser flow: reserve a row, "PUT" the bytes, then verify.
async function uploadFile(
  actor: Actor,
  productId: string,
  kind: "image" | "document",
  filename: string,
  mimeType: string,
  bytes: Uint8Array,
) {
  const ticket = await requestAssetUpload(db, actor, productId, {
    kind,
    filename,
    mimeType,
    sizeBytes: bytes.byteLength,
  });
  const storageKey = await storageKeyFor(ticket.assetId);
  fakeStore.set(storageKey, bytes);
  return completeAssetUpload(db, actor, productId, ticket.assetId);
}

async function storageKeyFor(assetId: string): Promise<string> {
  const [row] = await db
    .select({ key: productAssets.storageKey })
    .from(productAssets)
    .where(eq(productAssets.id, assetId));
  if (!row) throw new Error("asset row missing");
  return row.key;
}

async function productWithFiles(actor: Actor): Promise<string> {
  const product = await createProduct(db, actor, { name: "Ember Mug" });
  await uploadFile(
    actor,
    product.id,
    "image",
    "mug.jpg",
    "image/jpeg",
    await jpegBytes(),
  );
  await uploadFile(
    actor,
    product.id,
    "document",
    "product.txt",
    "text/plain",
    textBytes("Ember Mug 350ml. Dishwasher safe."),
  );
  return product.id;
}

describeIfDb("product service (integration, test database)", () => {
  beforeAll(async () => {
    db = await resetTestDatabase(TEST_URL as string);
  });

  afterAll(async () => {
    await closeDb(db);
  });

  beforeEach(() => {
    fakeStore.clear();
    vi.mocked(enqueueIngest).mockClear();
  });

  describe("tenancy", () => {
    it("denies every read and write on another org's product with NOT_FOUND", async () => {
      const productId = await productWithFiles(actorA);

      await expect(
        getProductDetail(db, actorB, productId),
      ).rejects.toBeInstanceOf(NotFoundError);
      await expect(
        deleteDraftProduct(db, actorB, productId),
      ).rejects.toBeInstanceOf(NotFoundError);
      await expect(
        requestAssetUpload(db, actorB, productId, {
          kind: "image",
          filename: "x.jpg",
          mimeType: "image/jpeg",
          sizeBytes: 10,
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
      await expect(
        submitForIngest(db, actorB, productId, "tenant-test-key-1"),
      ).rejects.toBeInstanceOf(NotFoundError);
      await expect(
        cancelActiveIngest(db, actorB, productId),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it("keeps another org's product intact after the denied attempts", async () => {
      const productId = await productWithFiles(actorA);
      await expect(
        deleteDraftProduct(db, actorB, productId),
      ).rejects.toBeInstanceOf(NotFoundError);
      const detail = await getProductDetail(db, actorA, productId);
      expect(detail.product.id).toBe(productId);
    });

    it("lists only the caller's products", async () => {
      await createProduct(db, actorB, { name: "Only in B" });
      const forA = await listProducts(db, actorA, { limit: 50 });
      expect(forA.every((p) => p.orgId === ORG_A)).toBe(true);
    });
  });

  describe("upload verification", () => {
    it("strips EXIF from an image and records the verified state", async () => {
      const product = await createProduct(db, actorA, { name: "EXIF test" });
      const asset = await uploadFile(
        actorA,
        product.id,
        "image",
        "photo.jpg",
        "image/jpeg",
        await jpegBytes(),
      );

      expect(asset.exifStripped).toBe(true);
      expect(asset.verifiedAt).not.toBeNull();
      const stored = fakeStore.get(await storageKeyFor(asset.id));
      expect(stored).toBeDefined();
      expect(
        (await sharp(stored as Uint8Array).metadata()).exif,
      ).toBeUndefined();
    });

    it("rejects a file whose bytes do not match its declared type, and removes it", async () => {
      const product = await createProduct(db, actorA, { name: "Spoof test" });
      const ticket = await requestAssetUpload(db, actorA, product.id, {
        kind: "image",
        filename: "fake.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 40,
      });
      fakeStore.set(
        await storageKeyFor(ticket.assetId),
        textBytes("this is plainly not a jpeg image!!"),
      );

      await expect(
        completeAssetUpload(db, actorA, product.id, ticket.assetId),
      ).rejects.toBeInstanceOf(ValidationError);
      const rows = await db
        .select()
        .from(productAssets)
        .where(eq(productAssets.id, ticket.assetId));
      expect(rows).toHaveLength(0);
      expect(fakeStore.size).toBe(0);
    });

    it("rejects an image under 600 px on its short side", async () => {
      const product = await createProduct(db, actorA, { name: "Small image" });
      const small = new Uint8Array(
        await sharp({
          create: {
            width: 300,
            height: 300,
            channels: 3,
            background: { r: 0, g: 0, b: 0 },
          },
        })
          .jpeg()
          .toBuffer(),
      );
      await expect(
        uploadFile(
          actorA,
          product.id,
          "image",
          "small.jpg",
          "image/jpeg",
          small,
        ),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it("rejects a second document", async () => {
      const product = await createProduct(db, actorA, { name: "Two docs" });
      await uploadFile(
        actorA,
        product.id,
        "document",
        "a.txt",
        "text/plain",
        textBytes("first"),
      );
      await expect(
        requestAssetUpload(db, actorA, product.id, {
          kind: "document",
          filename: "b.txt",
          mimeType: "text/plain",
          sizeBytes: 5,
        }),
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });

  describe("submit, idempotency and cancel", () => {
    it("submits once per idempotency key and returns the same job on repeat", async () => {
      const productId = await productWithFiles(actorA);
      const key = `submit-${v7()}`;

      const first = await submitForIngest(db, actorA, productId, key);
      const second = await submitForIngest(db, actorA, productId, key);

      expect(first.created).toBe(true);
      expect(second.created).toBe(false);
      expect(second.job.id).toBe(first.job.id);
      const jobs = await db
        .select()
        .from(ingestJobs)
        .where(eq(ingestJobs.productId, productId));
      expect(jobs).toHaveLength(1);
    });

    it("refuses to submit a product without a verified photo and document", async () => {
      const product = await createProduct(db, actorA, { name: "No files" });
      await expect(
        submitForIngest(db, actorA, product.id, `nofiles-${v7()}`),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it("cancelling a queued job keeps it cancelled when a late step tries to finish", async () => {
      const productId = await productWithFiles(actorA);
      const { job } = await submitForIngest(
        db,
        actorA,
        productId,
        `cancel-${v7()}`,
      );
      const cancelled = await cancelActiveIngest(db, actorA, productId);
      expect(cancelled.status).toBe("draft");

      const scope: IngestScope = {
        orgId: ORG_A,
        productId,
        jobId: job.id,
        actorId: "dev-user",
      };
      await finalizeIngest(db, scope);

      const [row] = await db
        .select()
        .from(ingestJobs)
        .where(eq(ingestJobs.id, job.id));
      expect(row?.status).toBe("cancelled");
      const [product] = await db
        .select()
        .from(products)
        .where(eq(products.id, productId));
      expect(product?.ingestedAt).toBeNull();
    });

    it("refuses to cancel a product that is not processing", async () => {
      const product = await createProduct(db, actorA, {
        name: "Not processing",
      });
      await expect(
        cancelActiveIngest(db, actorA, product.id),
      ).rejects.toBeInstanceOf(ConflictError);
    });
  });

  describe("ingest workflow steps", () => {
    it("runs load, parse and finalize, returning the product to draft with ingested_at set", async () => {
      const productId = await productWithFiles(actorA);
      const { job } = await submitForIngest(
        db,
        actorA,
        productId,
        `happy-${v7()}`,
      );
      const scope: IngestScope = {
        orgId: ORG_A,
        productId,
        jobId: job.id,
        actorId: "dev-user",
      };
      // The Inngest function marks the job running first; finalize only succeeds from that state.
      expect(await markJobRunning(db, scope)).toBe(true);

      expect((await loadAndCheckAssets(db, scope)).ok).toBe(true);
      expect((await parseDocumentStep(db, scope)).ok).toBe(true);
      await finalizeIngest(db, scope);

      const [row] = await db
        .select()
        .from(ingestJobs)
        .where(eq(ingestJobs.id, job.id));
      expect(row?.status).toBe("succeeded");
      expect(row?.steps.map((s) => (s as { status: string }).status)).toEqual([
        "succeeded",
        "succeeded",
        "succeeded",
      ]);
      const [product] = await db
        .select()
        .from(products)
        .where(eq(products.id, productId));
      expect(product?.status).toBe("draft");
      expect(product?.ingestedAt).not.toBeNull();

      const [doc] = await db
        .select()
        .from(productAssets)
        .where(
          and(
            eq(productAssets.productId, productId),
            eq(productAssets.kind, "document"),
          ),
        );
      expect(doc?.parsedText).toContain("Dishwasher safe");

      const events = await db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.entityId, productId));
      expect(events.map((e) => e.action)).toContain("ingest.succeeded");
    });

    it("re-running the parse step gives the same stored text (idempotent)", async () => {
      const productId = await productWithFiles(actorA);
      const { job } = await submitForIngest(
        db,
        actorA,
        productId,
        `rerun-${v7()}`,
      );
      const scope: IngestScope = {
        orgId: ORG_A,
        productId,
        jobId: job.id,
        actorId: "dev-user",
      };

      await parseDocumentStep(db, scope);
      const first = await db
        .select()
        .from(productAssets)
        .where(eq(productAssets.productId, productId));
      await parseDocumentStep(db, scope);
      const second = await db
        .select()
        .from(productAssets)
        .where(eq(productAssets.productId, productId));
      expect(second.find((a) => a.kind === "document")?.parsedText).toBe(
        first.find((a) => a.kind === "document")?.parsedText,
      );
    });

    it("a document with no readable text fails the job and the product", async () => {
      const product = await createProduct(db, actorA, { name: "Blank doc" });
      await uploadFile(
        actorA,
        product.id,
        "image",
        "photo.jpg",
        "image/jpeg",
        await jpegBytes(),
      );
      await uploadFile(
        actorA,
        product.id,
        "document",
        "blank.txt",
        "text/plain",
        textBytes("   \n  "),
      );
      const { job } = await submitForIngest(
        db,
        actorA,
        product.id,
        `blank-${v7()}`,
      );
      const scope: IngestScope = {
        orgId: ORG_A,
        productId: product.id,
        jobId: job.id,
        actorId: "dev-user",
      };

      const outcome = await parseDocumentStep(db, scope);
      expect(outcome.ok).toBe(false);
      await failIngest(db, scope, "PERMANENT", "No readable text");

      const [row] = await db
        .select()
        .from(ingestJobs)
        .where(eq(ingestJobs.id, job.id));
      expect(row?.status).toBe("failed");
      const [updated] = await db
        .select()
        .from(products)
        .where(eq(products.id, product.id));
      expect(updated?.status).toBe("failed");
    });

    it("enqueues the ingest event once per submit", async () => {
      const productId = await productWithFiles(actorA);
      await submitForIngest(db, actorA, productId, `enqueue-${v7()}`);
      expect(vi.mocked(enqueueIngest)).toHaveBeenCalledTimes(1);
    });
  });

  describe("delete draft", () => {
    it("removes the product, its rows and its stored objects", async () => {
      const productId = await productWithFiles(actorA);
      expect(fakeStore.size).toBeGreaterThan(0);
      await deleteDraftProduct(db, actorA, productId);

      const rows = await db
        .select()
        .from(products)
        .where(eq(products.id, productId));
      expect(rows).toHaveLength(0);
      expect(fakeStore.size).toBe(0);
    });

    it("refuses to delete a product that is processing", async () => {
      const productId = await productWithFiles(actorA);
      await submitForIngest(db, actorA, productId, `delete-${v7()}`);
      await expect(
        deleteDraftProduct(db, actorA, productId),
      ).rejects.toBeInstanceOf(ConflictError);
    });
  });
});
