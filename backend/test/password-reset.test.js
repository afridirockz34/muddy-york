import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { createHash } from "node:crypto";
import { prisma } from "../src/db.js";
import { resetDb } from "./helpers/db.js";

const { buildApp } = await import("../src/app.js");
const app = buildApp();
const cookieName = process.env.SESSION_COOKIE_NAME || "my_session";
const sha256 = (s) => createHash("sha256").update(s).digest("hex");

async function signup(email) {
  await app.inject({ method: "POST", url: "/auth/signup", payload: { email, password: "supersecret1" } });
}

describe("password reset", () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  it("forgot always returns ok and sets a token for an email account", async () => {
    await signup("r@b.com");
    const res = await app.inject({ method: "POST", url: "/auth/forgot", payload: { email: "r@b.com" } });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
    const u = await prisma.user.findUnique({ where: { email: "r@b.com" } });
    expect(u.resetTokenHash).toBeTruthy();
    expect(u.resetTokenExp.getTime()).toBeGreaterThan(Date.now());
  });

  it("forgot for an unknown email still returns ok (no user enumeration)", async () => {
    const res = await app.inject({ method: "POST", url: "/auth/forgot", payload: { email: "nobody@b.com" } });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
  });

  it("reset with a valid token changes the password and signs in", async () => {
    await signup("r2@b.com");
    // Simulate the emailed token by planting its hash directly.
    await prisma.user.update({ where: { email: "r2@b.com" }, data: { resetTokenHash: sha256("goodtoken"), resetTokenExp: new Date(Date.now() + 3600e3) } });
    const res = await app.inject({ method: "POST", url: "/auth/reset", payload: { token: "goodtoken", password: "brandnew123" } });
    expect(res.statusCode).toBe(200);
    expect(res.cookies.find((c) => c.name === cookieName)).toBeTruthy(); // session set
    // token is consumed
    const u = await prisma.user.findUnique({ where: { email: "r2@b.com" } });
    expect(u.resetTokenHash).toBeNull();
    // can log in with the new password
    const login = await app.inject({ method: "POST", url: "/auth/login", payload: { email: "r2@b.com", password: "brandnew123" } });
    expect(login.statusCode).toBe(200);
  });

  it("reset rejects an invalid or expired token", async () => {
    await signup("r3@b.com");
    await prisma.user.update({ where: { email: "r3@b.com" }, data: { resetTokenHash: sha256("expired"), resetTokenExp: new Date(Date.now() - 1000) } });
    expect((await app.inject({ method: "POST", url: "/auth/reset", payload: { token: "expired", password: "brandnew123" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/auth/reset", payload: { token: "nope", password: "brandnew123" } })).statusCode).toBe(400);
  });
});
