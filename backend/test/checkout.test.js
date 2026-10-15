import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "../src/db.js";
import { resetDb } from "./helpers/db.js";

const sessionCreate = vi.hoisted(() => vi.fn());
vi.mock("../src/billing/stripe.js", () => ({
  getStripe: () => ({
    customers: { create: vi.fn().mockResolvedValue({ id: "cus_test" }) },
    checkout: { sessions: { create: sessionCreate } },
    billingPortal: { sessions: { create: vi.fn().mockResolvedValue({ url: "https://portal.stripe.test/xyz" }) } },
  }),
}));

const { buildApp } = await import("../src/app.js");
const app = buildApp();
const cookieName = process.env.SESSION_COOKIE_NAME || "my_session";

async function signup(email) {
  const s = await app.inject({ method: "POST", url: "/auth/signup", payload: { email, password: "supersecret1", displayName: "u_" + email } });
  return s.cookies.find((c) => c.name === cookieName).value;
}

describe("billing routes", () => {
  beforeEach(async () => {
    await resetDb();
    sessionCreate.mockReset();
    sessionCreate.mockResolvedValue({ client_secret: "cs_test_embedded_abc" });
  });
  afterAll(() => prisma.$disconnect());

  it("returns an embedded checkout clientSecret for an authed user and stores the customer id", async () => {
    const token = await signup("c@b.com");
    const res = await app.inject({ method: "POST", url: "/billing/checkout",
      cookies: { [cookieName]: token }, payload: { plan: "monthly" } });
    expect(res.statusCode).toBe(200);
    expect(res.json().clientSecret).toBe("cs_test_embedded_abc");
    const user = await prisma.user.findUnique({ where: { email: "c@b.com" } });
    expect(user.stripeCustomerId).toBe("cus_test");
  });
  it("asks for Terms acceptance inside Stripe checkout", async () => {
    const token = await signup("t@b.com");
    await app.inject({ method: "POST", url: "/billing/checkout", cookies: { [cookieName]: token }, payload: { plan: "monthly" } });
    const params = sessionCreate.mock.calls[0][0];
    expect(params.consent_collection).toEqual({ terms_of_service: "required" });
    expect(params.custom_text.terms_of_service_acceptance.message).toContain("/terms/#refunds");
  });
  it("falls back to a line by the button when Stripe has no Terms URL", async () => {
    sessionCreate.mockReset();
    sessionCreate
      .mockRejectedValueOnce({ raw: { message: "You cannot collect consent to your terms of service unless a URL is set in the Stripe Dashboard." } })
      .mockResolvedValueOnce({ client_secret: "cs_fallback" });
    const token = await signup("f@b.com");
    const res = await app.inject({ method: "POST", url: "/billing/checkout", cookies: { [cookieName]: token }, payload: { plan: "monthly" } });
    expect(res.json().clientSecret).toBe("cs_fallback");
    const params = sessionCreate.mock.calls[1][0];
    expect(params.consent_collection).toBeUndefined();
    expect(params.custom_text.submit.message).toContain("Terms and refund policy");
  });
  it("401s checkout when unauthenticated", async () => {
    const res = await app.inject({ method: "POST", url: "/billing/checkout", payload: { plan: "monthly" } });
    expect(res.statusCode).toBe(401);
  });
  it("exposes the publishable key at /billing/config", async () => {
    const res = await app.inject({ method: "GET", url: "/billing/config" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty("publishableKey");
  });
  it("signup no longer grants a no-card trial", async () => {
    await signup("notrial@b.com");
    const user = await prisma.user.findUnique({ where: { email: "notrial@b.com" } });
    expect(user.trialEnd).toBeNull();
  });
  it("returns a portal url once the user has a customer id", async () => {
    const token = await signup("p@b.com");
    await app.inject({ method: "POST", url: "/billing/checkout", cookies: { [cookieName]: token }, payload: { plan: "monthly" } });
    const res = await app.inject({ method: "POST", url: "/billing/portal", cookies: { [cookieName]: token } });
    expect(res.statusCode).toBe(200);
    expect(res.json().url).toContain("portal.stripe.test");
  });
});
