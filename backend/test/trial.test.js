import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { resetDb } from "./helpers/db.js";

const app = buildApp();
const cookieName = process.env.SESSION_COOKIE_NAME || "my_session";

describe("trial on signup", () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  // No no-card trial: the free trial starts only at checkout (see webhook tests).
  it("new signup is free until checkout", async () => {
    const s = await app.inject({ method: "POST", url: "/auth/signup", payload: { email: "t@b.com", password: "supersecret1", displayName: "u_t@b.com" } });
    const cookie = s.cookies.find((c) => c.name === cookieName);
    const me = await app.inject({ method: "GET", url: "/auth/me", cookies: { [cookieName]: cookie.value } });
    expect(me.json().entitlement).toBe("free");
  });
  it("unauthenticated /me is 'free'", async () => {
    const me = await app.inject({ method: "GET", url: "/auth/me" });
    expect(me.json().entitlement).toBe("free");
  });
});
