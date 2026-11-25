import { describe, it, expect, beforeEach, afterAll, afterEach, vi } from "vitest";
import Stripe from "stripe";
process.env.ADMIN_EMAIL = "boss@muddy.co";
const { prisma } = await import("../src/db.js");
const { resetDb } = await import("./helpers/db.js");
const { clientIdFromCookie, sendGa4 } = await import("../src/analytics/ga4.js");
const weather = { airMean: 6, days: 7, flow: "Low / clear", p48: 0, wind: 10, cloud: 80, pressureTrend: null };
const { buildApp } = await import("../src/app.js");
const app = buildApp({ fetchWeather: async () => weather });
const stripe = new Stripe("sk_test_dummy");
const cookieName = process.env.SESSION_COOKIE_NAME || "my_session";

describe("Google Analytics conversions", () => {
  beforeEach(resetDb);
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.GA4_MEASUREMENT_ID; delete process.env.GA4_API_SECRET; });
  afterAll(() => prisma.$disconnect());

  it("reads the client id from the _ga cookie", () => {
    expect(clientIdFromCookie("GA1.1.123456789.1700000000")).toBe("123456789.1700000000");
    expect(clientIdFromCookie("junk")).toBe(null);
  });

  it("is off without credentials, and sends the landing page when on", async () => {
    const user = await prisma.user.create({ data: { email: "g@b.com", gaClientId: "111.222" } });
    await prisma.event.create({ data: { userId: user.id, type: "acquisition", meta: { landing: "/rivers/credit-river/" } } });
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 204 }));
    expect(await sendGa4(user, "subscribe", { value: 5 }, { fetchImpl })).toBe(false);
    process.env.GA4_MEASUREMENT_ID = "G-TEST"; process.env.GA4_API_SECRET = "s3cret";
    expect(await sendGa4(user, "subscribe", { value: 5 }, { fetchImpl })).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toContain("measurement_id=G-TEST");
    const body = JSON.parse(init.body);
    expect(body.client_id).toBe("111.222");
    expect(body.events[0]).toMatchObject({ name: "subscribe", params: { value: 5, landing_page: "/rivers/credit-river/" } });
  });

  it("sends subscribe on the first paid charge and renewal after that", async () => {
    process.env.GA4_MEASUREMENT_ID = "G-TEST"; process.env.GA4_API_SECRET = "s3cret";
    const sent = [];
    const real = globalThis.fetch;
    vi.stubGlobal("fetch", async (url, init) => { if (String(url).includes("google-analytics.com")) { sent.push(JSON.parse(init.body).events[0].name); return { ok: true, status: 204 }; } return real(url, init); });
    await prisma.user.create({ data: { email: "p@b.com", stripeCustomerId: "cus_ga" } });
    const post = async (id) => { const payload = JSON.stringify({ id, type: "invoice.payment_succeeded", data: { object: { id: "in_" + id, customer: "cus_ga", amount_paid: 6000, currency: "cad", billing_reason: "subscription_cycle", lines: { data: [] } } } });
      const header = stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET });
      return app.inject({ method: "POST", url: "/webhooks/stripe", headers: { "stripe-signature": header, "content-type": "application/json" }, payload }); };
    expect((await post("e1")).statusCode).toBe(200);
    expect((await post("e2")).statusCode).toBe(200);
    await new Promise((r) => setTimeout(r, 50));
    expect(sent).toEqual(["subscribe", "renewal"]);
  });

  it("saves the Analytics id at checkout", async () => {
    const s = await app.inject({ method: "POST", url: "/auth/signup", payload: { email: "c@b.com", password: "supersecret1", displayName: "u_c" } });
    const token = s.cookies.find((c) => c.name === cookieName).value;
    await app.inject({ method: "POST", url: "/billing/checkout", cookies: { [cookieName]: token }, payload: { plan: "monthly", gaCookie: "GA1.1.999.888" } });
    expect((await prisma.user.findUnique({ where: { email: "c@b.com" } })).gaClientId).toBe("999.888");
  });
});

describe("river status for public pages", () => {
  beforeEach(resetDb);
  it("scores an open stretch, gives a closed one no score, and rejects unknown rivers", async () => {
    const r = await app.inject({ method: "GET", url: "/api/reach-status?ids=credit-lower,nope" });
    expect(r.statusCode).toBe(200);
    const [x] = r.json().reaches;
    expect(x).toMatchObject({ id: "credit-lower", flow: "Low / clear", rain48mm: 0 });
    expect(typeof x.waterC).toBe("number");
    expect(x.updatedAt).toMatch(/^\d{4}-\d\d-\d\dT/);
    if (x.season === "closed") expect(x.score).toBe(null); else expect(x.score).toBeGreaterThan(0);
    expect((await app.inject({ method: "GET", url: "/api/reach-status?ids=nope" })).statusCode).toBe(400);
  });
});

describe("security policy reports", () => {
  beforeEach(resetDb);
  it("stores what the policy would block and shows it to the admin only", async () => {
    const r = await app.inject({ method: "POST", url: "/api/csp-report", headers: { "content-type": "application/csp-report" },
      payload: JSON.stringify({ "csp-report": { "blocked-uri": "https://evil.example/x.js", "effective-directive": "script-src", "document-uri": "https://muddyyorkfishing.ca/fishing/" } }) });
    expect(r.statusCode).toBe(204);
    const s = await app.inject({ method: "POST", url: "/auth/signup", payload: { email: "boss@muddy.co", password: "supersecret1", displayName: "boss" } });
    const token = s.cookies.find((c) => c.name === cookieName).value;
    const d = (await app.inject({ method: "GET", url: "/api/admin/csp", cookies: { [cookieName]: token } })).json();
    expect(d.total).toBe(1);
    expect(d.top[0].label).toBe("script-src · https://evil.example/x.js");
    expect((await app.inject({ method: "GET", url: "/api/admin/csp" })).statusCode).toBe(403);
  });
});
