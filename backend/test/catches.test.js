import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { resetDb } from "./helpers/db.js";

const app = buildApp();
const cookieName = process.env.SESSION_COOKIE_NAME || "my_session";
async function signup(email) {
  const s = await app.inject({ method: "POST", url: "/auth/signup", payload: { email, password: "supersecret1" } });
  return s.cookies.find((c) => c.name === cookieName).value;
}
const body = { ref: "grand-tw", river: "Grand River", section: "Tailwater", species: "Brown trout", sizeInches: 14 };

describe("catches", () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  it("401 unauthenticated", async () => {
    expect((await app.inject({ method: "POST", url: "/catches", payload: body })).statusCode).toBe(401);
  });
  it("logs, lists own, and never stores coordinates", async () => {
    const c = { [cookieName]: await signup("c@b.com") };
    const r = await app.inject({ method: "POST", url: "/catches", cookies: c, payload: body });
    expect(r.statusCode).toBe(200);
    const row = await prisma.catch.findFirst();
    expect(row.ref).toBe("grand-tw");
    expect(Object.keys(row)).not.toContain("lat");
    expect(Object.keys(row)).not.toContain("lon");
    const list = await app.inject({ method: "GET", url: "/catches", cookies: c });
    expect(list.json().catches).toHaveLength(1);
  });
  it("activity is anonymized counts only (no userId/coords)", async () => {
    const c = { [cookieName]: await signup("a@b.com") };
    await app.inject({ method: "POST", url: "/catches", cookies: c, payload: body });
    const act = await app.inject({ method: "GET", url: "/api/catch-activity" });
    const a = act.json().activity["grand-tw"];
    expect(a.count30d).toBe(1);
    expect(a.momentum).toBeGreaterThan(0);
    expect(JSON.stringify(act.json())).not.toMatch(/userId|@b\.com|lat|lon/);
  });
});
