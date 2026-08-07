import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "../src/db.js";
import { resetDb } from "./helpers/db.js";

vi.mock("../src/billing/stripe.js", () => ({
  getStripe: () => ({
    customers: { create: vi.fn().mockResolvedValue({ id: "cus_test" }) },
    checkout: { sessions: { create: vi.fn().mockResolvedValue({ url: "https://checkout.stripe.test/abc" }) } },
    billingPortal: { sessions: { create: vi.fn().mockResolvedValue({ url: "https://portal.stripe.test/xyz" }) } },
  }),
}));

const { buildApp } = await import("../src/app.js");
const app = buildApp();
const cookieName = process.env.SESSION_COOKIE_NAME || "my_session";

async function signup(email) {
  const s = await app.inject({ method: "POST", url: "/auth/signup", payload: { email, password: "supersecret1" } });
  return s.cookies.find((c) => c.name === cookieName).value;
}

describe("billing routes", () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  it("returns a checkout url for an authed user and stores the customer id", async () => {
    const token = await signup("c@b.com");
    const res = await app.inject({ method: "POST", url: "/billing/checkout",
      cookies: { [cookieName]: token }, payload: { plan: "monthly" } });
    expect(res.statusCode).toBe(200);
    expect(res.json().url).toContain("checkout.stripe.test");
    const user = await prisma.user.findUnique({ where: { email: "c@b.com" } });
    expect(user.stripeCustomerId).toBe("cus_test");
  });
  it("401s checkout when unauthenticated", async () => {
    const res = await app.inject({ method: "POST", url: "/billing/checkout", payload: { plan: "monthly" } });
    expect(res.statusCode).toBe(401);
  });
  it("returns a portal url once the user has a customer id", async () => {
    const token = await signup("p@b.com");
    await app.inject({ method: "POST", url: "/billing/checkout", cookies: { [cookieName]: token }, payload: { plan: "monthly" } });
    const res = await app.inject({ method: "POST", url: "/billing/portal", cookies: { [cookieName]: token } });
    expect(res.statusCode).toBe(200);
    expect(res.json().url).toContain("portal.stripe.test");
  });
});
