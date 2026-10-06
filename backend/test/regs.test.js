import { describe, it, expect, beforeEach, afterAll } from "vitest";
import fs from "node:fs";
import { prisma } from "../src/db.js";
import { resetDb } from "./helpers/db.js";

process.env.ADMIN_EMAIL = "boss@muddy.co";
const { buildApp } = await import("../src/app.js");
const { syncAll, seedIfEmpty, flatten } = await import("../src/regs/sync.js");
const app = buildApp();
const cookieName = process.env.SESSION_COOKIE_NAME || "my_session";

const fixture = fs.readFileSync(new URL("../../lib/fixtures/fmz16-excerpt.html", import.meta.url), "utf8");
// Fake ontario.ca: zone 16 serves `page16`, every other zone fails.
const fakeFetch = (page16) => async (url) => (url.endsWith("zone-16")
  ? { ok: true, status: 200, text: async () => page16 }
  : { ok: false, status: 503, text: async () => "" });

async function resetRegs() {
  await prisma.regsChange.deleteMany();
  await prisma.regsZone.deleteMany();
}

describe("regs sync", () => {
  beforeEach(async () => { await resetDb(); await resetRegs(); });
  afterAll(() => prisma.$disconnect());

  it("stores a parsed zone and keeps the last good copy when a page breaks", async () => {
    const r1 = await syncAll({ fetchImpl: fakeFetch(fixture), notify: false, pauseMs: 0 });
    expect(r1.checked).toBe(1);
    expect(r1.failed).toHaveLength(19);
    const row = await prisma.regsZone.findUnique({ where: { zone: 16 } });
    expect(row.data.waterbody.length).toBe(2);

    const r2 = await syncAll({ fetchImpl: fakeFetch("<html>Down for maintenance</html>"), notify: false, pauseMs: 0 });
    expect(r2.failed.find((f) => f.zone === 16).error).toMatch(/not recognised/);
    const kept = await prisma.regsZone.findUnique({ where: { zone: 16 } });
    expect(kept.hash).toBe(row.hash);
    expect(kept.lastError).toMatch(/not recognised/);
  });

  it("records what changed when Ontario edits a page", async () => {
    await syncAll({ fetchImpl: fakeFetch(fixture), notify: false, pauseMs: 0 });
    const edited = fixture.replace("August 15 to December 31", "September 1 to December 31");
    const r = await syncAll({ fetchImpl: fakeFetch(edited), notify: false, pauseMs: 0 });
    expect(r.changed).toHaveLength(1);
    const ch = await prisma.regsChange.findFirst({ where: { zone: 16 } });
    expect(ch.added.some((l) => l.includes("September 1 to December 31"))).toBe(true);
    expect(ch.removed.some((l) => l.includes("August 15 to December 31"))).toBe(true);
  });

  it("seeds from the shipped snapshot only when empty", async () => {
    expect(await seedIfEmpty()).toBe(true);
    expect(await prisma.regsZone.count()).toBe(20);
    expect(await seedIfEmpty()).toBe(false);
  });

  it("flattens every rule to comparable lines", async () => {
    const lines = flatten((await import("../../lib/regs-parse.js")).parseZonePage(fixture, 16));
    expect(lines.some((l) => l.startsWith("Waterbody exception · Credit River and tributaries"))).toBe(true);
  });
});

describe("regs routes", () => {
  beforeEach(async () => { await resetDb(); await resetRegs(); await seedIfEmpty(); });

  it("serves official bundles with deep links for each section", async () => {
    const r = await app.inject({ method: "GET", url: "/api/regs/reaches" });
    expect(r.statusCode).toBe(200);
    const credit = r.json().reaches["credit-lower"];
    expect(credit.zone).toBe(16);
    expect(credit.stretches[1].entries[0].text).toMatch(/Highway 403 bridge/);
    expect(credit.stretches[1].entries[0].link).toMatch(/fisheries-management-zone-16#:~:text=/);
  });

  it("looks up official entries by water name", async () => {
    const r = await app.inject({ method: "GET", url: "/api/regs/lookup?name=Credit%20River" });
    expect(r.json().entries.length).toBeGreaterThan(3);
    expect((await app.inject({ method: "GET", url: "/api/regs/lookup?name=x" })).statusCode).toBe(400);
  });

  it("keeps the legacy endpoint working, computed from official data", async () => {
    const r = await app.inject({ method: "GET", url: "/api/regulations" });
    expect(r.json().version).toBe("official-sync");
    expect(["open", "closed", "check"]).toContain(r.json().reaches["credit-lower"].state);
  });

  it("limits the admin regs view to admins", async () => {
    expect((await app.inject({ method: "GET", url: "/api/admin/regs" })).statusCode).toBe(403);
    const s = await app.inject({ method: "POST", url: "/auth/signup", payload: { email: "boss@muddy.co", password: "supersecret1", displayName: "boss" } });
    const t = s.cookies.find((c) => c.name === cookieName).value;
    const r = await app.inject({ method: "GET", url: "/api/admin/regs", cookies: { [cookieName]: t } });
    expect(r.statusCode).toBe(200);
    expect(r.json().zones).toHaveLength(20);
    expect(r.json().unmatched).toEqual([]);
  });
});

describe("regs lookup matching", () => {
  beforeEach(async () => { await resetDb(); await resetRegs(); await seedIfEmpty(); });
  it("matches the whole water name only", async () => {
    const r = (await app.inject({ method: "GET", url: "/api/regs/lookup?name=Humber%20River" })).json();
    expect(r.entries.length).toBeGreaterThan(0);
    expect(r.entries.every((e) => /Humber River/i.test(e.text))).toBe(true);
  });
});

describe("regs status endpoint", () => {
  beforeEach(async () => { await resetDb(); await resetRegs(); await seedIfEmpty(); });
  it("returns today's official status for one section and species", async () => {
    const r = await app.inject({ method: "GET", url: "/api/regs/status?id=credit-lower&sp=STL,CHN" });
    expect(r.statusCode).toBe(200);
    expect(["open", "closed", "check", "some", "varies"]).toContain(r.json().state);
    expect(r.json().stretches.length).toBe(2);
    expect((await app.inject({ method: "GET", url: "/api/regs/status?id=nope" })).statusCode).toBe(404);
  });
});

describe("zone regulation pages", () => {
  beforeEach(async () => { await resetDb(); await resetRegs(); await seedIfEmpty(); });
  it("renders the index and a zone page with official seasons", async () => {
    const idx = await app.inject({ method: "GET", url: "/regulations/" });
    expect(idx.statusCode).toBe(200);
    expect(idx.body).toContain('href="/regulations/zone-16/"');
    const z = await app.inject({ method: "GET", url: "/regulations/zone-16/" });
    expect(z.statusCode).toBe(200);
    expect(z.body).toMatch(/<title>Zone 16 Fishing Regulations \d{4}: Seasons &amp; Limits<\/title>/);
    expect(z.body).toContain("Rainbow trout");
    expect(z.body).toContain("fourth Saturday in April to September 30");
    expect(z.body).toContain('href="/rivers/credit-river-lower-mouth-to-streetsville/"');
    expect((await app.inject({ method: "GET", url: "/regulations/zone-99/" })).statusCode).toBe(302);
  });
});

describe("zone-at", () => {
  beforeEach(async () => { await prisma.mapDataCache.deleteMany({ where: { key: { startsWith: "fmz:" } } }); });

  it("parses the FMZ service answer", async () => {
    const { fmzAt } = await import("../src/routes/regulations.js");
    const ok = async () => ({ ok: true, json: async () => ({ features: [{ attributes: { FISHERIES_MANAGEMENT_ZONE_ID: 17 } }] }) });
    expect(await fmzAt(43.9, -78.3, ok)).toBe(17);
    const none = async () => ({ ok: true, json: async () => ({ features: [] }) });
    expect(await fmzAt(43.9, -78.3, none)).toBe(null);
  });

  it("answers from the cache with the zone page link", async () => {
    await prisma.mapDataCache.create({ data: { key: "fmz:43.65,-79.50", data: { zone: 16 }, fetchedAt: new Date() } });
    const r = await app.inject({ method: "GET", url: "/api/regs/zone-at?lat=43.651&lon=-79.501" });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ zone: 16, page: "/regulations/zone-16/" });
    expect(r.json().url).toMatch(/fisheries-management-zone-16$/);
    expect((await app.inject({ method: "GET", url: "/api/regs/zone-at?lat=10&lon=10" })).statusCode).toBe(400);
  });

  it("batch: one zone per cell, flags waters named in the rules", async () => {
    await syncAll({ fetchImpl: fakeFetch(fixture), notify: false, pauseMs: 0 });
    await prisma.mapDataCache.create({ data: { key: "fmz:43.70,-79.90", data: { zone: 16 }, fetchedAt: new Date() } });
    const r = await app.inject({ method: "POST", url: "/api/regs/zones-at", payload: { points: [
      { lat: 43.701, lon: -79.899, name: "Credit River" }, { lat: 43.702, lon: -79.901, name: "Nowhere Brook" }, { lat: 0, lon: 0 } ] } });
    expect(r.statusCode).toBe(200);
    const d = r.json();
    expect(d.points[0].zone).toBe(16);
    expect(d.points[0].named).toBeGreaterThan(0);
    expect(d.points[1]).toEqual({ zone: 16, named: 0 });
    expect(d.points[2].zone).toBe(null);
    expect(d.zones["16"].bundle.stretches[0].zoneWideOnly).toBe(true);
    const { statusFor } = await import("../../lib/regs-status.js");
    const s = statusFor(d.zones["16"].bundle, ["BKT"], new Date("2026-07-01T12:00:00"));
    expect(s.state).toBe("open");
  });
});
