import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "../src/db.js";
import { resetDb } from "./helpers/db.js";

const { buildApp } = await import("../src/app.js");
const app = buildApp();
const cookieName = process.env.SESSION_COOKIE_NAME || "my_session";

async function signup(email) {
  const s = await app.inject({ method: "POST", url: "/auth/signup", payload: { email, password: "supersecret1" } });
  return s.cookies.find((c) => c.name === cookieName).value;
}
const auth = (t) => ({ cookies: { [cookieName]: t } });
const noteBody = (id, extra = {}) => ({ id, title: "T", body: "B", species: "Brown", createdAt: "2026-08-01T00:00:00.000Z", ...extra });

describe("notes sync routes", () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  it("401s all endpoints when unauthenticated", async () => {
    expect((await app.inject({ method: "POST", url: "/notes", payload: noteBody("n1") })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/notes" })).statusCode).toBe(401);
    expect((await app.inject({ method: "DELETE", url: "/notes/n1" })).statusCode).toBe(401);
  });

  it("upserts a note and is idempotent on re-push", async () => {
    const t = await signup("a@b.com");
    const r1 = await app.inject({ method: "POST", url: "/notes", ...auth(t), payload: noteBody("n1", { lat: 43.7, lon: -79.4 }) });
    expect(r1.statusCode).toBe(200);
    expect(r1.json().note.lat).toBe(43.7);
    await app.inject({ method: "POST", url: "/notes", ...auth(t), payload: noteBody("n1") });
    const rows = await prisma.note.findMany({ where: { id: "n1" } });
    expect(rows).toHaveLength(1); // no duplicate
  });

  it("GET returns live notes and tombstoned ids; DELETE tombstones idempotently", async () => {
    const t = await signup("c@b.com");
    await app.inject({ method: "POST", url: "/notes", ...auth(t), payload: noteBody("keep") });
    await app.inject({ method: "POST", url: "/notes", ...auth(t), payload: noteBody("gone") });
    const d1 = await app.inject({ method: "DELETE", url: "/notes/gone", ...auth(t) });
    expect(d1.statusCode).toBe(200);
    const d2 = await app.inject({ method: "DELETE", url: "/notes/gone", ...auth(t) }); // idempotent
    expect(d2.statusCode).toBe(200);
    const g = (await app.inject({ method: "GET", url: "/notes", ...auth(t) })).json();
    expect(g.notes.map((n) => n.id)).toEqual(["keep"]);
    expect(g.deleted).toContain("gone");
    expect(g.serverTime).toBeTruthy();
  });

  it("?since only returns rows changed after the cursor", async () => {
    const t = await signup("s@b.com");
    await app.inject({ method: "POST", url: "/notes", ...auth(t), payload: noteBody("old") });
    const mid = new Date().toISOString();
    await new Promise((r) => setTimeout(r, 5));
    await app.inject({ method: "POST", url: "/notes", ...auth(t), payload: noteBody("new") });
    const g = (await app.inject({ method: "GET", url: "/notes?since=" + encodeURIComponent(mid), ...auth(t) })).json();
    expect(g.notes.map((n) => n.id)).toEqual(["new"]);
  });

  it("enforces ownership: user B cannot read or delete user A's notes", async () => {
    const ta = await signup("owner@b.com");
    const tb = await signup("intruder@b.com");
    await app.inject({ method: "POST", url: "/notes", ...auth(ta), payload: noteBody("secret") });
    const gb = (await app.inject({ method: "GET", url: "/notes", ...auth(tb) })).json();
    expect(gb.notes).toHaveLength(0);
    await app.inject({ method: "DELETE", url: "/notes/secret", ...auth(tb) });
    const ga = (await app.inject({ method: "GET", url: "/notes", ...auth(ta) })).json();
    expect(ga.notes.map((n) => n.id)).toEqual(["secret"]); // A's note untouched
  });
});
