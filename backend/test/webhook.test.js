import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import Stripe from "stripe";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { resetDb } from "./helpers/db.js";

const app = buildApp();
const stripe = new Stripe("sk_test_dummy");
const secret = process.env.STRIPE_WEBHOOK_SECRET; // from backend/.env via test setup

function signed(event) {
  const payload = JSON.stringify(event);
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
  return { payload, header };
}

describe("POST /webhooks/stripe", () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  it("rejects a bad signature", async () => {
    const res = await app.inject({ method: "POST", url: "/webhooks/stripe",
      headers: { "stripe-signature": "bad", "content-type": "application/json" }, payload: JSON.stringify({ a: 1 }) });
    expect(res.statusCode).toBe(400);
  });

  it("stores a subscription on checkout.session.completed", async () => {
    const user = await prisma.user.create({ data: { email: "w@b.com" } });
    const event = { id: "evt_1", type: "checkout.session.completed",
      data: { object: { client_reference_id: user.id, customer: "cus_1", subscription: "sub_1" } } };
    const { payload, header } = signed(event);
    const res = await app.inject({ method: "POST", url: "/webhooks/stripe",
      headers: { "stripe-signature": header, "content-type": "application/json" }, payload });
    expect(res.statusCode).toBe(200);
    const sub = await prisma.subscription.findUnique({ where: { userId: user.id } });
    expect(sub.id).toBe("sub_1");
    expect(sub.status).toBe("trialing"); // checkout always starts the free trial
  });

  const post = async (event) => { const { payload, header } = signed(event);
    return app.inject({ method: "POST", url: "/webhooks/stripe", headers: { "stripe-signature": header, "content-type": "application/json" }, payload }); };
  const mailSpy = () => { process.env.RESEND_API_KEY = "re_test";
    return vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("{}", { status: 200 })); };
  const subjects = (spy) => spy.mock.calls.filter((c) => String(c[0]).includes("resend")).map((c) => JSON.parse(c[1].body).subject);

  it("reminds once before a trial ends", async () => {
    const user = await prisma.user.create({ data: { email: "t@b.com", stripeCustomerId: "cus_t" } });
    await prisma.subscription.create({ data: { id: "sub_t", userId: user.id, status: "trialing" } });
    const spy = mailSpy();
    const trialEnd = Math.floor(Date.parse("2026-10-20T12:00:00Z") / 1000);
    const event = { id: "evt_t", type: "customer.subscription.trial_will_end", data: { object: { id: "sub_t", customer: "cus_t", status: "trialing", trial_end: trialEnd,
      items: { data: [{ price: { unit_amount: 5999, currency: "cad", recurring: { interval: "year" } } }] } } } };
    expect((await post(event)).statusCode).toBe(200);
    await post(event); // Stripe retry
    const sent = subjects(spy);
    spy.mockRestore();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatch(/free trial ends October 20, 2026/);
  });

  it("reminds before a yearly renewal, not a monthly one", async () => {
    const user = await prisma.user.create({ data: { email: "y@b.com", stripeCustomerId: "cus_y" } });
    await prisma.subscription.create({ data: { id: "sub_y", userId: user.id, status: "active" } });
    const spy = mailSpy();
    const when = Math.floor(Date.parse("2027-10-20T12:00:00Z") / 1000);
    const inv = (interval) => ({ id: "evt_" + interval, type: "invoice.upcoming", data: { object: { customer: "cus_y", amount_due: interval === "year" ? 5999 : 999, currency: "cad", next_payment_attempt: when,
      lines: { data: [{ price: { id: "price_x", recurring: { interval } } }] } } } });
    await post(inv("month"));
    await post(inv("year"));
    await post(inv("year"));
    const sent = subjects(spy);
    spy.mockRestore();
    expect(sent).toEqual(["Your yearly membership renews October 20, 2027"]);
  });
});
