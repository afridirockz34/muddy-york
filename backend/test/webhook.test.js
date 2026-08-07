import { describe, it, expect, beforeEach, afterAll } from "vitest";
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
    expect(sub.status).toBe("active");
  });
});
