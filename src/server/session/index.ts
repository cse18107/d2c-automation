import "server-only";
import { getSessionEnv } from "@/lib/env";
import type { Role } from "@/schemas/member";

export type Session = {
  orgId: string;
  userId: string;
  role: Role;
};

// Dev-only stand-in until real auth ships (ADR 0002). It refuses to run in
// production, so a deployment cannot act as an org by accident.
export function getSession(source: NodeJS.ProcessEnv = process.env): Session {
  const env = getSessionEnv(source);
  if (env.NODE_ENV === "production") {
    throw new Error(
      "Authentication is not configured. The dev session is disabled in production (ADR 0002).",
    );
  }
  if (!env.DEV_SESSION_ORG_ID) {
    throw new Error("DEV_SESSION_ORG_ID must be set to use the dev session.");
  }
  return { orgId: env.DEV_SESSION_ORG_ID, userId: "dev-user", role: "owner" };
}
