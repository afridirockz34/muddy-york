import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "../src/db.js";
import { resetDb } from "./helpers/db.js";

process.env.ADMIN_EMAIL = "boss@muddy.co";

const { buildApp } = await import("../src/app.js");
const app = buildApp();
const cookieName = process.env.SESSION_COOKIE_NAME || "my_session";

async function signup(email) {
  const s = await app.inject({ method: "POST", url: "/auth/signup", payload: { email, password: "supersecret1" } });
  return s.cookies.find((c) => c.name === cookieName).value;
}
const auth = (t) => ({ cookies: { [cookieName]: t } });

describe("admin overview", () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  it("403s for non-admins and unauthenticated", async () => {
    expect((await app.inject({ method: "GET", url: "/api/admin/overview" })).statusCode).toBe(403);
    const t = await signup("u@b.com");
    expect((await app.inject({ method: "GET", url: "/api/admin/overview", ...auth(t) })).statusCode).toBe(403);
  });

  it("returns counts and recent signups for the admin", async () => {
    const admin = await signup("boss@muddy.co");
    await signup("member@b.com");
    const r = await app.inject({ method: "GET", url: "/api/admin/overview", ...auth(admin) });
    expect(r.statusCode).toBe(200);
    const d = r.json();
    expect(d.users.total).toBe(2);
    expect(d.users.new7d).toBe(2);
    expect(Array.isArray(d.recentSignups)).toBe(true);
    expect(d.recentSignups.some((u) => u.email === "member@b.com")).toBe(true);
    expect(d.content).toHaveProperty("catches");
    expect(d.members).toHaveProperty("active");
  });
});
