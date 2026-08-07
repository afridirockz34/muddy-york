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
      payload: { email: "a@b.com", password: "supersecret1" } });
    expect(signup.statusCode).toBe(200);
    const cookie = signup.cookies.find((c) => c.name === cookieName);
    expect(cookie).toBeTruthy();
    const me = await app.inject({ method: "GET", url: "/auth/me",
      cookies: { [cookieName]: cookie.value } });
    expect(me.json().user.email).toBe("a@b.com");
  });
  it("rejects a duplicate email", async () => {
    await app.inject({ method: "POST", url: "/auth/signup", payload: { email: "d@b.com", password: "supersecret1" } });
    const dup = await app.inject({ method: "POST", url: "/auth/signup", payload: { email: "d@b.com", password: "supersecret1" } });
    expect(dup.statusCode).toBe(409);
  });
  it("logs in with correct creds and rejects wrong ones", async () => {
    await app.inject({ method: "POST", url: "/auth/signup", payload: { email: "l@b.com", password: "supersecret1" } });
    const ok = await app.inject({ method: "POST", url: "/auth/login", payload: { email: "l@b.com", password: "supersecret1" } });
    expect(ok.statusCode).toBe(200);
    const bad = await app.inject({ method: "POST", url: "/auth/login", payload: { email: "l@b.com", password: "wrong" } });
    expect(bad.statusCode).toBe(401);
  });
  it("returns null user when unauthenticated", async () => {
    const me = await app.inject({ method: "GET", url: "/auth/me" });
    expect(me.json().user).toBe(null);
  });
});
