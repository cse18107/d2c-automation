import { v7 } from "uuid";
import { describe, expect, it } from "vitest";
import { getSession } from "./index";

describe("getSession (dev shim)", () => {
  it("returns the configured org as owner outside production", () => {
    const orgId = v7();
    expect(
      getSession({ NODE_ENV: "development", DEV_SESSION_ORG_ID: orgId }),
    ).toEqual({
      orgId,
      userId: "dev-user",
      role: "owner",
    });
  });

  it("refuses to run in production", () => {
    expect(() =>
      getSession({ NODE_ENV: "production", DEV_SESSION_ORG_ID: v7() }),
    ).toThrow(/disabled in production/);
  });

  it("requires DEV_SESSION_ORG_ID", () => {
    expect(() => getSession({ NODE_ENV: "development" })).toThrow(
      /DEV_SESSION_ORG_ID/,
    );
  });
});
