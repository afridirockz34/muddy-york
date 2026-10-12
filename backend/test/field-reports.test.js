import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "../src/db.js";
import { resetDb } from "./helpers/db.js";

process.env.ADMIN_EMAIL = "boss@muddy.co";
const { buildApp } = await import("../src/app.js");
const { torontoDay } = await import("../src/routes/field-reports.js");
const { sendTripReminders } = await import("../src/reports/reminders.js");

const streamFetch = vi.fn(async () => ({ ok: true, json: async () => ({ features: [
  { attributes: { OFFICIAL_WATERBODY_NAME: "Credit River", THERMAL_REGIME: "Cold", FISH_SPECIES_SUMMARY: "Brook Trout,Brown Trout" } },
] }) }));
const app = buildApp({ streamFetch });
const cookieName = process.env.SESSION_COOKIE_NAME || "my_session";
async function signup(email, { member = false } = {}) {
  const s = await app.inject({ method: "POST", url: "/auth/signup", payload: { email, password: "supersecret1", displayName: "u_" + email.split("@")[0] } });
  if (member) await prisma.user.update({ where: { email }, data: { trialEnd: new Date(Date.now() + 5 * 864e5) } });
  return { [cookieName]: s.cookies.find((c) => c.name === cookieName).value };
}
const day = (n) => torontoDay(new Date(Date.now() + n * 864e5));

describe("trip reports", () => {
  beforeEach(async () => { await resetDb(); await prisma.runNote.deleteMany(); await prisma.mapDataCache.deleteMany({ where: { key: { startsWith: "ara:" } } }); });
  afterAll(() => prisma.$disconnect());

  it("asks about yesterday's trip, takes the report, and stops asking", async () => {
    const c = await signup("t@b.com");
    await app.inject({ method: "POST", url: "/trip-intents", cookies: c, payload: { ref: "credit-lower", river: "Credit River", section: "Lower", score: 84 } });
    // Pretend the Directions tap was yesterday.
    await prisma.tripIntent.updateMany({ data: { dayKey: day(-1) } });
    const pend = (await app.inject({ method: "GET", url: "/trip-intents/pending", cookies: c })).json().pending;
    expect(pend).toHaveLength(1);
    expect(pend[0]).toMatchObject({ ref: "credit-lower", score: 84 });
    const r = await app.inject({ method: "POST", url: "/trip-reports", cookies: c, payload: { ref: "credit-lower", dayKey: day(-1), fished: true, caught: 0, waterTempC: 9.5 } });
    expect(r.statusCode).toBe(200);
    const saved = await prisma.tripReport.findFirst();
    expect(saved).toMatchObject({ caught: 0, scoreAtTrip: 84, river: "Credit River", waterTempC: 9.5 });
    expect((await app.inject({ method: "GET", url: "/trip-intents/pending", cookies: c })).json().pending).toHaveLength(0);
    // Re-reporting the same day updates rather than duplicates.
    await app.inject({ method: "POST", url: "/trip-reports", cookies: c, payload: { ref: "credit-lower", dayKey: day(-1), caught: 2, species: ["STL"] } });
    expect(await prisma.tripReport.count()).toBe(1);
    expect((await prisma.tripReport.findFirst()).caught).toBe(2);
  });

  it("rejects future and old dates, and needs sign-in", async () => {
    expect((await app.inject({ method: "POST", url: "/trip-reports", payload: { ref: "x" } })).statusCode).toBe(401);
    const c = await signup("d@b.com");
    expect((await app.inject({ method: "POST", url: "/trip-reports", cookies: c, payload: { ref: "x", dayKey: day(2) } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/trip-reports", cookies: c, payload: { ref: "x", dayKey: day(-30) } })).statusCode).toBe(400);
  });

  it("publishes river totals only with 3+ reports, held back two days", async () => {
    const users = [];
    for (const e of ["a@b.com", "b@b.com", "c@b.com"]) users.push(await signup(e));
    for (const c of users) await app.inject({ method: "POST", url: "/trip-reports", cookies: c, payload: { ref: "humber-lower", dayKey: day(-4), caught: 1 } });
    await app.inject({ method: "POST", url: "/trip-reports", cookies: users[0], payload: { ref: "rouge-lower", dayKey: day(-4), caught: 1 } });
    await app.inject({ method: "POST", url: "/trip-reports", cookies: users[1], payload: { ref: "humber-lower", dayKey: day(0), caught: 5 } });
    const d = (await app.inject({ method: "GET", url: "/api/river-reports" })).json();
    expect(d.byRef["humber-lower"]).toMatchObject({ trips: 3, withFish: 3 });
    expect(d.byRef["rouge-lower"]).toBeUndefined();
  });

  it("reports score accuracy from trips with a score", async () => {
    const c = await signup("s@b.com");
    await app.inject({ method: "POST", url: "/trip-reports", cookies: c, payload: { ref: "x", dayKey: day(-1), caught: 1, scoreAtTrip: 88 } });
    const a = (await app.inject({ method: "GET", url: "/api/score-accuracy" })).json();
    expect(a).toMatchObject({ trips: 1, target: 300, ready: false });
    expect(a.bands[0]).toMatchObject({ label: "80+", trips: 1, caughtRate: 100 });
  });

  it("sends one morning reminder per person, then not again", async () => {
    const c = await signup("r@b.com");
    await app.inject({ method: "POST", url: "/trip-intents", cookies: c, payload: { ref: "credit-lower", river: "Credit River" } });
    await app.inject({ method: "POST", url: "/trip-intents", cookies: c, payload: { ref: "humber-lower", river: "Humber River" } });
    const morning = new Date(); morning.setUTCHours(13, 30, 0, 0); // 9:30 a.m. Toronto (EDT)
    await prisma.tripIntent.updateMany({ data: { dayKey: torontoDay(new Date(morning.getTime() - 864e5)) } });
    const send = vi.fn().mockResolvedValue(true);
    expect((await sendTripReminders({ now: morning, send })).sent).toBe(1);
    expect(send.mock.calls[0][1].title).toMatch(/yesterday\?$/);
    expect((await sendTripReminders({ now: morning, send })).sent).toBe(0);
    const evening = new Date(morning.getTime() + 9 * 3600e3);
    expect((await sendTripReminders({ now: evening, send })).skipped).toBeTruthy();
  });
});

describe("run tracker", () => {
  beforeEach(async () => { await resetDb(); await prisma.runNote.deleteMany(); });

  it("shows a public status, takes member sightings, and keeps the timeline for members", async () => {
    const spot = "humber-river-old-mill-toronto";
    const free = await signup("f@b.com");
    expect((await app.inject({ method: "POST", url: "/run-checkins", cookies: free, payload: { spot, status: "moving" } })).statusCode).toBe(402);
    const m = await signup("m@b.com", { member: true });
    const r = await app.inject({ method: "POST", url: "/run-checkins", cookies: m, payload: { spot, status: "moving" } });
    expect(r.json()).toMatchObject({ state: "moving", reports7: 1 });
    // A second sighting within 6 hours replaces the first.
    await app.inject({ method: "POST", url: "/run-checkins", cookies: m, payload: { spot, status: "stacked" } });
    expect(await prisma.runCheckin.count()).toBe(1);
    expect((await app.inject({ method: "POST", url: "/run-checkins", cookies: m, payload: { spot: "nope", status: "moving" } })).statusCode).toBe(400);
    const pub = (await app.inject({ method: "GET", url: `/api/run-status?spot=${spot}` })).json();
    expect(pub).toMatchObject({ state: "stacked", reports7: 1, note: null });
    expect((await app.inject({ method: "GET", url: `/api/run-status/${spot}/timeline`, cookies: free })).statusCode).toBe(402);
    expect((await app.inject({ method: "GET", url: `/api/run-status/${spot}/timeline`, cookies: m })).json().days).toHaveLength(1);
    expect((await app.inject({ method: "GET", url: "/api/run-status" })).json().spots.length).toBe(9);
  });

  it("lets only the admin write the weekly note", async () => {
    const spot = "bowmanville-creek";
    const u = await signup("x@b.com");
    expect((await app.inject({ method: "PUT", url: `/api/admin/run-notes/${spot}`, cookies: u, payload: { note: "Hi" } })).statusCode).toBe(403);
    const a = await signup("boss@muddy.co");
    await app.inject({ method: "PUT", url: `/api/admin/run-notes/${spot}`, cookies: a, payload: { note: "Fish moving after Friday's rain" } });
    expect((await app.inject({ method: "GET", url: `/api/run-status?spot=${spot}` })).json().note).toBe("Fish moving after Friday's rain");
  });
});

describe("stream info", () => {
  it("returns the official thermal class and surveyed species, cached", async () => {
    await prisma.mapDataCache.deleteMany({ where: { key: { startsWith: "ara:" } } });
    streamFetch.mockClear();
    const body = { points: [{ lat: 43.78, lon: -80.0, name: "Credit River" }, { lat: 43.78, lon: -80.0 }, { lat: 1, lon: 1 }] };
    const d = (await app.inject({ method: "POST", url: "/api/stream-info", payload: body })).json();
    expect(d.points[0]).toMatchObject({ thermal: "Cold", name: "Credit River" });
    expect(d.points[0].species).toContain("Brook Trout");
    expect(d.points[2]).toBe(null);
    expect(streamFetch).toHaveBeenCalledTimes(1);
    await app.inject({ method: "POST", url: "/api/stream-info", payload: body });
    expect(streamFetch).toHaveBeenCalledTimes(1);
    await prisma.mapDataCache.deleteMany({ where: { key: { startsWith: "ara:" } } });
  });
});
