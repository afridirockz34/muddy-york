import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { resetDb } from "./helpers/db.js";

const app = buildApp();
const cookieName = process.env.SESSION_COOKIE_NAME || "my_session";

describe("requirePremium guard", () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  it("allows a trialing (fresh signup) user", async () => {
    const s = await app.inject({ method: "POST", url: "/auth/signup", payload: { email: "g@b.com", password: "supersecret1" } });
    const token = s.cookies.find((c) => c.name === cookieName).value;
    const res = await app.inject({ method: "GET", url: "/premium/ping", cookies: { [cookieName]: token } });
    expect(res.statusCode).toBe(200);
  });
  it("402s a user whose trial has expired and has no subscription", async () => {
    const s = await app.inject({ method: "POST", url: "/auth/signup", payload: { email: "e@b.com", password: "supersecret1" } });
    const token = s.cookies.find((c) => c.name === cookieName).value;
    await prisma.user.update({ where: { email: "e@b.com" }, data: { trialEnd: new Date(Date.now() - 1000) } });
    const res = await app.inject({ method: "GET", url: "/premium/ping", cookies: { [cookieName]: token } });
    expect(res.statusCode).toBe(402);
  });
  it("401s when unauthenticated", async () => {
    const res = await app.inject({ method: "GET", url: "/premium/ping" });
    expect(res.statusCode).toBe(401);
  });
});
