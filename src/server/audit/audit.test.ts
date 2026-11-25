import { v7 } from "uuid";
import { describe, expect, it, vi } from "vitest";
import { ValidationError } from "@/server/errors";
import { recordAuditEvent } from "./index";

function fakeDb() {
  const values = vi.fn().mockResolvedValue(undefined);
  const insert = vi.fn(() => ({ values }));
  return {
    db: { insert } as unknown as Parameters<typeof recordAuditEvent>[0],
    insert,
    values,
  };
}

const base = () => ({
  orgId: v7(),
  actorId: "dev-user",
  action: "product.created",
  entityType: "product",
  entityId: v7(),
  metadata: { name: "Ember Mug" },
});

describe("recordAuditEvent", () => {
  it("inserts a valid event once", async () => {
    const { db, insert, values } = fakeDb();
    await recordAuditEvent(db, base());
    expect(insert).toHaveBeenCalledTimes(1);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ action: "product.created" }),
    );
  });

  it("rejects an action that is not dotted lowercase", async () => {
    const { db, insert } = fakeDb();
    await expect(
      recordAuditEvent(db, { ...base(), action: "Product Created" }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects metadata keys that could carry secrets or signed URLs", async () => {
    for (const key of [
      "accessToken",
      "uploadUrl",
      "secretAccessKey",
      "cookie",
    ]) {
      const { db, insert } = fakeDb();
      await expect(
        recordAuditEvent(db, { ...base(), metadata: { [key]: "x" } }),
      ).rejects.toThrow(/forbidden keys/);
      expect(insert).not.toHaveBeenCalled();
    }
  });

  it("rejects a non-UUIDv7 entity id", async () => {
    const { db, insert } = fakeDb();
    await expect(
      recordAuditEvent(db, {
        ...base(),
        entityId: "11111111-1111-4111-8111-111111111111",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(insert).not.toHaveBeenCalled();
  });
});
