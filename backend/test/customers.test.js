import { describe, it, expect, beforeEach, afterAll, afterEach, vi } from "vitest";
import { inflateRawSync } from "node:zlib";

// The admin list is read when config loads, so set it before importing the app.
process.env.ADMIN_EMAIL = "boss@muddy.co";
const { prisma } = await import("../src/db.js");
const { resetDb } = await import("./helpers/db.js");
const { buildXlsx } = await import("../src/customers/xlsx.js");
const { customerProfiles, riverFor } = await import("../src/customers/profile.js");
const { runWelcome, welcomeCopy } = await import("../src/nurture/welcome.js");
const { syncAll, subscriberBody } = await import("../src/mailerlite/sync.js");
const { buildApp } = await import("../src/app.js");
const app = buildApp();
const cookieName = process.env.SESSION_COOKIE_NAME || "my_session";
const auth = (t) => ({ cookies: { [cookieName]: t } });
async function signup(email) {
  const s = await app.inject({ method: "POST", url: "/auth/signup", payload: { email, password: "supersecret1", displayName: "u_" + email.split("@")[0] } });
  return s.cookies.find((c) => c.name === cookieName).value;
}

// Unzip one part of an .xlsx (stored with deflate) for checking.
function part(buf, name) {
  let i = 0;
  while (buf.readUInt32LE(i) === 0x04034b50) {
    const size = buf.readUInt32LE(i + 18), nlen = buf.readUInt16LE(i + 26), elen = buf.readUInt16LE(i + 28);
    const n = buf.slice(i + 30, i + 30 + nlen).toString(), start = i + 30 + nlen + elen;
    if (n === name) return inflateRawSync(buf.slice(start, start + size)).toString();
    i = start + size;
  }
  return null;
}

const morning = new Date("2026-11-03T15:00:00Z"); // 10 a.m. Toronto
async function freeUser(email, { hoursOld = 30, views = [], pages = [], acq } = {}) {
  const u = await prisma.user.create({ data: { email, displayName: email.split("@")[0], createdAt: new Date(morning - hoursOld * 3600e3) } });
  for (const ref of views) await prisma.event.create({ data: { userId: u.id, type: "view_reach", ref, createdAt: new Date(morning - 20 * 3600e3) } });
  for (const ref of pages) await prisma.event.create({ data: { userId: u.id, type: "pageview", ref, createdAt: new Date(morning - 29 * 3600e3) } });
  if (acq) await prisma.event.create({ data: { userId: u.id, type: "acquisition", ref: acq.source, meta: acq } });
  return u;
}

describe("customer profiles", () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  it("maps reach ids, river pages and river main pages to rivers", () => {
    expect(riverFor("wilmot-lower")?.river ?? riverFor("/rivers/wilmot-creek-lower-newcastle/")?.river).toBe("Wilmot Creek");
    expect(riverFor("/rivers/credit-river/").river).toBe("Credit River");
    expect(riverFor("/rivers/wilmot-creek-lower-newcastle")?.river).toBe("Wilmot Creek");
    expect(riverFor("/blog/")).toBe(null);
  });

  it("builds plan, source, device and river interest, including website visits", async () => {
    await freeUser("a@b.com", { views: ["credit-lower", "credit-lower"], pages: ["/rivers/wilmot-creek-lower-newcastle/"],
      acq: { source: "instagram", landing: "/rivers/wilmot-creek-lower-newcastle/", device: { type: "Mobile", os: "iOS", browser: "Safari" } } });
    const [p] = await customerProfiles();
    expect(p.planLabel).toBe("Free");
    expect(p.source).toBe("Instagram");
    expect(p.device).toBe("Mobile, iOS, Safari");
    expect(p.topRiver).toBe("Credit River");
    expect(p.firstRiver).toBe("Wilmot Creek");
    expect(p.rivers).toEqual(["Credit River", "Wilmot Creek"]);
  });
});

describe("admin customers list and export", () => {
  beforeEach(resetDb);

  it("is admin only, lists everyone with search, and exports a real xlsx", async () => {
    const admin = await signup("boss@muddy.co");
    for (let i = 0; i < 4; i++) await signup(`old${i}@b.com`);
    expect((await app.inject({ method: "GET", url: "/api/admin/customers" })).statusCode).toBe(403);
    const all = (await app.inject({ method: "GET", url: "/api/admin/customers?limit=2", ...auth(admin) })).json();
    expect(all.total).toBe(5);
    expect(all.rows).toHaveLength(2);
    const found = (await app.inject({ method: "GET", url: "/api/admin/customers?q=old3", ...auth(admin) })).json();
    expect(found.rows.map((r) => r.email)).toEqual(["old3@b.com"]);
    const free = (await app.inject({ method: "GET", url: "/api/admin/customers?plan=free", ...auth(admin) })).json();
    expect(free.total).toBe(5);

    const x = await app.inject({ method: "GET", url: "/api/admin/customers/export.xlsx", ...auth(admin) });
    expect(x.statusCode).toBe(200);
    expect(x.headers["content-type"]).toMatch(/spreadsheetml/);
    expect(x.headers["content-disposition"]).toMatch(/muddy-york-customers-.*\.xlsx/);
    const sheet = part(x.rawPayload, "xl/worksheets/sheet1.xml");
    expect(sheet).toContain("Subscription");
    expect(sheet).toContain("old0@b.com");
    expect((await app.inject({ method: "GET", url: "/api/admin/customers/export.xlsx" })).statusCode).toBe(403);
  });

  it("records email consent at sign-up", async () => {
    await signup("c@b.com");
    expect((await prisma.user.findUnique({ where: { email: "c@b.com" } })).emailConsentAt).toBeTruthy();
  });

  it("writes valid xlsx parts", () => {
    const buf = buildXlsx({ sheet: "T", columns: [{ header: "A" }, { header: "B" }], rows: [["x & <y>", 3], [null, ""]] });
    expect(part(buf, "[Content_Types].xml")).toContain("spreadsheetml");
    const s = part(buf, "xl/worksheets/sheet1.xml");
    expect(s).toContain("x &amp; &lt;y&gt;");
    expect(s).toContain('<c r="B2"><v>3</v></c>');
    expect(s).toContain('autoFilter ref="A1:B3"');
  });
});

describe("welcome emails", () => {
  beforeEach(resetDb);
  const weather = vi.fn().mockResolvedValue({ airMean: 9, days: 3, flow: "Normal", wind: 8, cloud: 80 });
  const seasonOf = () => ({ state: "open" });

  it("sends day 1 about the rivers they looked at, then day 4, then stops", async () => {
    await freeUser("r@b.com", { views: ["credit-lower"] });
    const sendEmail = vi.fn().mockResolvedValue(true);
    expect((await runWelcome({ now: morning, sendEmail, fetchWeather: weather, seasonOf })).sent).toBe(1);
    const first = sendEmail.mock.calls[0][0];
    expect(first.subject).toBe("How we can help you fish the Credit River");
    expect(first.text).toMatch(/\*\*Today:\*\* \d+ out of 100/);
    expect(first.text).toContain("in season today");
    expect(first.unsubscribe === undefined || /unsubscribe/.test(first.unsubscribe)).toBe(true);
    expect(first.cta.url).toContain("utm_campaign=welcome-1");
    // Not again the same day, nor two days later.
    expect((await runWelcome({ now: new Date(morning.getTime() + 3600e3), sendEmail, fetchWeather: weather, seasonOf })).sent).toBe(0);
    expect((await runWelcome({ now: new Date(morning.getTime() + 2 * 864e5), sendEmail, fetchWeather: weather, seasonOf })).sent).toBe(0);
    expect((await runWelcome({ now: new Date(morning.getTime() + 3 * 864e5), sendEmail, fetchWeather: weather, seasonOf })).sent).toBe(1);
    expect(sendEmail.mock.calls[1][0].subject).toBe("Know the day the Credit River turns good");
    expect((await runWelcome({ now: new Date(morning.getTime() + 7 * 864e5), sendEmail, fetchWeather: weather, seasonOf })).sent).toBe(0);
    // It also holds off the weekly free-member email.
    expect((await prisma.user.findUnique({ where: { email: "r@b.com" } })).nurtureEmailAt).toBeTruthy();
  });

  it("uses the general version when we don't know their rivers", async () => {
    await freeUser("g@b.com");
    const sendEmail = vi.fn().mockResolvedValue(true);
    await runWelcome({ now: morning, sendEmail, fetchWeather: weather, seasonOf });
    expect(sendEmail.mock.calls[0][0].subject).toBe("Welcome to Muddy York Fishing: three things to try");
  });

  it("waits a full day, skips night hours, old accounts, members and unsubscribes", async () => {
    await freeUser("new@b.com", { hoursOld: 10 });
    await freeUser("old@b.com", { hoursOld: 24 * 30 });
    const out = await freeUser("out@b.com"); await prisma.user.update({ where: { id: out.id }, data: { emailOptOut: true } });
    const mem = await freeUser("mem@b.com"); await prisma.user.update({ where: { id: mem.id }, data: { trialEnd: new Date(morning.getTime() + 5 * 864e5) } });
    const sendEmail = vi.fn().mockResolvedValue(true);
    expect((await runWelcome({ now: new Date("2026-11-03T07:00:00Z"), sendEmail, fetchWeather: weather, seasonOf })).skipped).toBeTruthy(); // 2 a.m.
    expect((await runWelcome({ now: morning, sendEmail, fetchWeather: weather, seasonOf })).sent).toBe(0);
  });

  it("offers membership, not a trial, to someone who already had one", () => {
    const c = welcomeCopy(2, { name: "x", rivers: [], hadTrial: true });
    expect(c.cta.label).toBe("Become a member");
    expect(c.text).not.toMatch(/—/);
  });
});

describe("MailerLite sync", () => {
  beforeEach(resetDb);
  afterEach(() => { delete process.env.MAILERLITE_API_KEY; });

  it("does nothing without a key", async () => {
    expect((await syncAll()).skipped).toBeTruthy();
  });

  it("adds everyone subscribed, keeps unsubscribes both ways, never sends a status on updates", async () => {
    process.env.MAILERLITE_API_KEY = "test";
    await freeUser("keep@b.com");
    const ours = await freeUser("ours@b.com"); await prisma.user.update({ where: { id: ours.id }, data: { emailOptOut: true } });
    await freeUser("theirs@b.com");
    const calls = [];
    const fetchImpl = vi.fn(async (url, init) => {
      const u = new URL(url); calls.push({ path: u.pathname + u.search, method: init.method, body: init.body && JSON.parse(init.body) });
      const ok = (data) => ({ ok: true, status: 200, json: async () => data });
      if (u.pathname === "/api/groups" && init.method === "GET") return ok({ data: [] });
      if (u.pathname === "/api/groups") return ok({ data: { id: "g1" } });
      if (u.pathname === "/api/fields" && init.method === "GET") return ok({ data: [{ key: "plan" }] });
      if (u.pathname === "/api/subscribers" && u.searchParams.get("filter[status]") === "unsubscribed") return ok({ data: [{ email: "theirs@b.com" }], meta: {} });
      if (u.pathname === "/api/subscribers") return ok({ data: [], meta: {} });
      if (u.pathname === "/api/batch") return ok({ failed: 0 });
      return ok({ data: {} });
    });
    const r = await syncAll({ fetchImpl, log: {} });
    expect(r).toMatchObject({ synced: 1, unsubscribed: 1, optedOutFromMailerLite: 1, failed: 0 });
    expect((await prisma.user.findUnique({ where: { email: "theirs@b.com" } })).emailOptOut).toBe(true);
    const reqs = calls.filter((c) => c.path === "/api/batch").flatMap((c) => c.body.requests);
    const keep = reqs.find((q) => q.body.email === "keep@b.com");
    expect(keep.body.groups).toEqual(["g1"]);
    expect(keep.body).not.toHaveProperty("status");
    expect(reqs.find((q) => q.body.email === "ours@b.com").body.status).toBe("unsubscribed");
    expect(reqs.find((q) => q.body.email === "theirs@b.com")).toBeUndefined();
    expect(calls.filter((c) => c.path === "/api/fields" && c.method === "POST").length).toBe(5);
  });

  it("sends the fields the social team can segment by", () => {
    const b = subscriberBody({ email: "a@b.com", username: "sam", planLabel: "Free", registered: "2026-11-02T10:00:00.000Z", source: "Google", device: "Mobile, iOS", topRiver: "Credit River", savedRivers: [], emailConsent: true }, "g");
    expect(b.fields).toMatchObject({ name: "sam", plan: "Free", signup_date: "2026-11-02", source: "Google", river_interest: "Credit River", email_consent: "Agreed at sign-up" });
  });
});
