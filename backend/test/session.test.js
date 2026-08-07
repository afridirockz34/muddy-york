import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "../src/db.js";
import { resetDb } from "./helpers/db.js";
import { createSession, validateSession, invalidateSession } from "../src/auth/session.js";

async function makeUser() {
  return prisma.user.create({ data: { email: `u${Date.now()}${Math.random()}@x.com` } });
}

describe("sessions", () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  it("creates and validates a session", async () => {
    const u = await makeUser();
    const { token } = await createSession(u.id);
    const res = await validateSession(token);
    expect(res.user.id).toBe(u.id);
  });
  it("returns null for a bad token", async () => {
    expect(await validateSession("nope")).toBe(null);
  });
  it("invalidates a session", async () => {
    const u = await makeUser();
    const { token } = await createSession(u.id);
    await invalidateSession(token);
    expect(await validateSession(token)).toBe(null);
  });
});
