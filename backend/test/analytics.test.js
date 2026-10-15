import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "../src/db.js";
import { resetDb } from "./helpers/db.js";

process.env.ADMIN_EMAIL = "boss@muddy.co";

const { buildApp } = await import("../src/app.js");
const app = buildApp();
const cookieName = process.env.SESSION_COOKIE_NAME || "my_session";

async function signup(email) {
  const s = await app.inject({ method: "POST", url: "/auth/signup", payload: { email, password: "supersecret1", displayName: "u_" + email.split("@")[0] } });
  return s.cookies.find((c) => c.name === cookieName).value;
}
const auth = (t) => ({ cookies: { [cookieName]: t } });
const post = (payload, extra = {}) => app.inject({ method: "POST", url: "/api/events", payload, ...extra });

describe("site and app analytics", () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  it("stores visitor and session ids, and drops bots", async () => {
    await post({ visitorId: "vis_aaaaaaaa", sessionId: "ses_aaaaaaaa", events: [{ type: "pageview", ref: "/rivers/" }] });
    await post({ visitorId: "vis_bbbbbbbb", sessionId: "ses_bbbbbbbb", events: [{ type: "pageview", ref: "/" }] },
      { headers: { "user-agent": "Googlebot/2.1" } });
    const rows = await prisma.event.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ visitorId: "vis_aaaaaaaa", sessionId: "ses_aaaaaaaa", type: "pageview", ref: "/rivers/" });
  });

  it("ignores malformed ids", async () => {
    await post({ visitorId: "<script>", sessionId: "x", events: [{ type: "pageview", ref: "/" }] });
    const [row] = await prisma.event.findMany();
    expect(row.visitorId).toBeNull();
    expect(row.sessionId).toBeNull();
  });

  it("links a visitor's earlier anonymous events once they sign in", async () => {
    await post({ visitorId: "vis_cccccccc", sessionId: "ses_cccccccc", events: [{ type: "pageview", ref: "/gifts/" }] });
    const t = await signup("angler@b.com");
    await post({ visitorId: "vis_cccccccc", sessionId: "ses_cccccccc", events: [{ type: "screen", ref: "rivers" }] }, auth(t));
    const user = await prisma.user.findUnique({ where: { email: "angler@b.com" } });
    const rows = await prisma.event.findMany({ where: { visitorId: "vis_cccccccc" } });
    expect(rows.every((r) => r.userId === user.id)).toBe(true);
  });

  it("is admin-only", async () => {
    expect((await app.inject({ method: "GET", url: "/api/admin/analytics" })).statusCode).toBe(403);
    const t = await signup("u@b.com");
    expect((await app.inject({ method: "GET", url: "/api/admin/analytics", ...auth(t) })).statusCode).toBe(403);
  });

  it("summarises visitors, pages, clicks, funnel and sessions", async () => {
    const s1 = { visitorId: "vis_11111111", sessionId: "ses_11111111" };
    const s2 = { visitorId: "vis_22222222", sessionId: "ses_22222222" };
    await post({ ...s1, events: [
      { type: "session_start", ref: "google", meta: { source: "google", type: "Mobile", os: "iOS" } },
      { type: "pageview", ref: "/rivers/credit-river/" },
      { type: "click", ref: "Start your 7 free days", meta: { href: "/?join" } },
      { type: "page_leave", ref: "/rivers/credit-river/", meta: { secs: 40, scroll: 80 } },
      { type: "screen", ref: "rivers" },
      { type: "checkout_open", ref: "annual" },
    ] });
    await post({ ...s2, events: [
      { type: "session_start", ref: "direct", meta: { source: "direct", type: "Desktop", os: "macOS" } },
      { type: "pageview", ref: "/rivers/credit-river/" },
      { type: "page_leave", ref: "/rivers/credit-river/", meta: { secs: 20, scroll: 40 } },
    ] });
    const admin = await signup("boss@muddy.co");
    const r = await app.inject({ method: "GET", url: "/api/admin/analytics?days=7", ...auth(admin) });
    expect(r.statusCode).toBe(200);
    const d = r.json();
    expect(d.totals).toMatchObject({ visitors: 2, sessions: 2, pageviews: 2, screens: 1 });
    expect(d.pages[0]).toMatchObject({ label: "/rivers/credit-river/", count: 2, visitors: 2, secs: 30, scroll: 60 });
    expect(d.clicks[0]).toMatchObject({ label: "Start your 7 free days", count: 1 });
    expect(d.funnel.map((f) => f.count).slice(0, 4)).toEqual([2, 1, 1, 1]); // the admin's own signup counts as an account
    expect(d.sessions).toHaveLength(2);
    const sess = d.sessions.find((x) => x.id === "ses_11111111");
    expect(sess).toMatchObject({ source: "google", entry: "/rivers/credit-river/", views: 2 });

    const j = await app.inject({ method: "GET", url: "/api/admin/analytics/session/ses_11111111", ...auth(admin) });
    expect(j.json().events.map((e) => e.type)).toEqual(["session_start", "pageview", "click", "page_leave", "screen", "checkout_open"]);
  });
});
