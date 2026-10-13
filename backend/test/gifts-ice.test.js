import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "../src/db.js";
import { resetDb } from "./helpers/db.js";

process.env.ADMIN_EMAIL = "boss@muddy.co";
const { buildApp } = await import("../src/app.js");
const { fulfillGift } = await import("../src/routes/gifts.js");
const { syncAll } = await import("../src/regs/sync.js");

const lakeFetch = vi.fn(async () => ({ ok: true, json: async () => ({ features: [{ attributes: { OFFICIAL_WATERBODY_NAME: "Lake Simcoe", FISH_SPECIES_SUMMARY: "Walleye,Yellow Perch,Lake Trout,Lake Whitefish,Northern Pike", MAXIMUM_DEPTH: "41.5", MEAN_DEPTH: "17.0" } }] }) }));
const overpass = vi.fn(async () => new Response(JSON.stringify({ elements: [
  { type: "way", id: 7, tags: { name: "Big Test Lake" }, center: { lat: 44.40, lon: -79.30 }, bounds: { minlat: 44.38, minlon: -79.33, maxlat: 44.42, maxlon: -79.27 } },
  { type: "way", id: 8, tags: { name: "Puddle" }, center: { lat: 44.41, lon: -79.31 }, bounds: { minlat: 44.4099, minlon: -79.3101, maxlat: 44.4101, maxlon: -79.3099 } },
] }), { status: 200 }));
const app = buildApp({ streamFetch: lakeFetch, proxyFetch: overpass });
const cookieName = process.env.SESSION_COOKIE_NAME || "my_session";
async function signup(email) {
  const s = await app.inject({ method: "POST", url: "/auth/signup", payload: { email, password: "supersecret1", displayName: "u_" + email.split("@")[0] } });
  return { [cookieName]: s.cookies.find((c) => c.name === cookieName).value };
}

describe("gift memberships", () => {
  beforeEach(async () => { await resetDb(); await prisma.giftCode.deleteMany(); });
  afterAll(() => prisma.$disconnect());

  it("issues one code per paid session, emails it, and redeems it once for a year", async () => {
    const send = vi.fn().mockResolvedValue(true);
    const session = { id: "cs_test_1", payment_status: "paid", customer_details: { email: "buyer@b.com" }, metadata: { kind: "gift", recipientEmail: "friend@b.com", fromName: "Sam" } };
    const g = await fulfillGift(session, { send });
    expect(g.code).toMatch(/^MY-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(await fulfillGift(session, { send })).toMatchObject({ code: g.code }); // webhook retry: same gift
    expect(send.mock.calls.map((c) => c[0].to)).toEqual(expect.arrayContaining(["buyer@b.com", "friend@b.com"]));
    const c = await signup("friend@b.com");
    const r = await app.inject({ method: "POST", url: "/gift/redeem", cookies: c, payload: { code: g.code.toLowerCase() } });
    expect(r.statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/auth/me", cookies: c })).json().entitlement).toBe("active");
    const other = await signup("other@b.com");
    expect((await app.inject({ method: "POST", url: "/gift/redeem", cookies: other, payload: { code: g.code } })).statusCode).toBe(409);
    expect((await app.inject({ method: "POST", url: "/gift/redeem", cookies: other, payload: { code: "MY-NOPE-NOPE" } })).statusCode).toBe(404);
  });
  it("ignores unpaid sessions", async () => {
    expect(await fulfillGift({ id: "cs_2", payment_status: "unpaid", metadata: { kind: "gift" } })).toBe(null);
  });
});

describe("ice season", () => {
  beforeEach(async () => { await resetDb(); await prisma.setting.deleteMany(); });

  it("is off until the admin turns it on", async () => {
    expect((await app.inject({ method: "GET", url: "/api/season" })).json()).toEqual({ ice: false });
    const u = await signup("x@b.com");
    expect((await app.inject({ method: "PUT", url: "/api/admin/season", cookies: u, payload: { ice: true } })).statusCode).toBe(403);
    const a = await signup("boss@muddy.co");
    await app.inject({ method: "PUT", url: "/api/admin/season", cookies: a, payload: { ice: true } });
    expect((await app.inject({ method: "GET", url: "/api/season" })).json()).toEqual({ ice: true });
  });

  it("lists curated and nearby lakes with zone, species and the lake's own rules", async () => {
    const fs = await import("node:fs");
    const snap = JSON.parse(fs.readFileSync(new URL("../src/data/regs-zones.json", import.meta.url), "utf8"));
    await prisma.regsZone.deleteMany();
    for (const [z, data] of Object.entries(snap.zones)) await prisma.regsZone.create({ data: { zone: +z, url: data.url, hash: "x" + z, data, checkedAt: new Date(), fetchedAt: new Date() } }).catch(() => {});
    await prisma.mapDataCache.deleteMany({ where: { OR: [{ key: { startsWith: "icelakes:" } }, { key: { startsWith: "aralake:" } }] } });
    await prisma.mapDataCache.upsert({ where: { key: "fmz:44.42,-79.37" }, create: { key: "fmz:44.42,-79.37", data: { zone: 16 }, fetchedAt: new Date() }, update: { data: { zone: 16 } } });
    await prisma.mapDataCache.upsert({ where: { key: "fmz:44.40,-79.30" }, create: { key: "fmz:44.40,-79.30", data: { zone: 16 }, fetchedAt: new Date() }, update: { data: { zone: 16 } } });
    const d = (await app.inject({ method: "GET", url: "/api/ice/lakes?lat=44.4&lon=-79.4&radiusM=30000" })).json();
    const simcoe = d.lakes.find((l) => l.id === "lake-simcoe");
    expect(simcoe).toMatchObject({ curated: true, zone: 16, maxDepth: 41.5 });
    expect(simcoe.species).toEqual(expect.arrayContaining(["WAL", "YP", "LAT", "LWF", "NP"]));
    expect(simcoe.bundle.stretches[0].entries.length).toBeGreaterThan(0);
    expect(d.lakes.some((l) => l.name === "Big Test Lake")).toBe(true);
    expect(d.lakes.some((l) => l.name === "Puddle")).toBe(false);
    const { statusFor } = await import("../../lib/regs-status.js");
    const jan = statusFor(simcoe.bundle, ["LAT"], new Date("2027-01-20T12:00:00"));
    const apr = statusFor(simcoe.bundle, ["LAT"], new Date("2027-04-01T12:00:00"));
    expect(jan.state).toBe("open");
    expect(apr.state).toBe("closed");
  });
});
