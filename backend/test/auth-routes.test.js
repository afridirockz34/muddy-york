import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { resetDb } from "./helpers/db.js";

const app = buildApp();
const cookieName = process.env.SESSION_COOKIE_NAME || "my_session";

describe("auth routes", () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  it("signs up, sets a cookie, and returns the user from /me", async () => {
    const signup = await app.inject({ method: "POST", url: "/auth/signup",
      payload: { email: "a@b.com", password: "supersecret1", displayName: "u_a@b.com" } });
    expect(signup.statusCode).toBe(200);
    const cookie = signup.cookies.find((c) => c.name === cookieName);
    expect(cookie).toBeTruthy();
    const me = await app.inject({ method: "GET", url: "/auth/me",
      cookies: { [cookieName]: cookie.value } });
    expect(me.json().user.email).toBe("a@b.com");
  });
  it("rejects a duplicate email", async () => {
    await app.inject({ method: "POST", url: "/auth/signup", payload: { email: "d@b.com", password: "supersecret1", displayName: "u_d@b.com" } });
    const dup = await app.inject({ method: "POST", url: "/auth/signup", payload: { email: "d@b.com", password: "supersecret1", displayName: "u_d@b.com" } });
    expect(dup.statusCode).toBe(409);
  });
  it("logs in with correct creds and rejects wrong ones", async () => {
    await app.inject({ method: "POST", url: "/auth/signup", payload: { email: "l@b.com", password: "supersecret1", displayName: "u_l@b.com" } });
    const ok = await app.inject({ method: "POST", url: "/auth/login", payload: { email: "l@b.com", password: "supersecret1", displayName: "u_l@b.com" } });
    expect(ok.statusCode).toBe(200);
    const bad = await app.inject({ method: "POST", url: "/auth/login", payload: { email: "l@b.com", password: "wrong" } });
    expect(bad.statusCode).toBe(401);
  });
  it("rejects malformed and misspelled emails at signup", async () => {
    for (const email of ["not-an-email", "a@b", "joe@gmial.com", "a b@c.com"]) {
      const r = await app.inject({ method: "POST", url: "/auth/signup", payload: { email, password: "supersecret1", displayName: "x_" + email.length } });
      expect(r.statusCode, email).toBe(400);
      expect(r.json().error).toBe("invalid email");
    }
  });
  it("stores emails lowercase and matches them case-insensitively", async () => {
    const s = await app.inject({ method: "POST", url: "/auth/signup", payload: { email: "  Mixed@Case.COM ", password: "supersecret1", displayName: "mixed" } });
    expect(s.json().user.email).toBe("mixed@case.com");
    const dup = await app.inject({ method: "POST", url: "/auth/signup", payload: { email: "MIXED@case.com", password: "supersecret1", displayName: "mixed2" } });
    expect(dup.statusCode).toBe(409);
    const ok = await app.inject({ method: "POST", url: "/auth/login", payload: { email: "Mixed@CASE.com", password: "supersecret1" } });
    expect(ok.statusCode).toBe(200);
  });
  it("returns null user when unauthenticated", async () => {
    const me = await app.inject({ method: "GET", url: "/auth/me" });
    expect(me.json().user).toBe(null);
  });
});
