import { describe, it, expect } from "vitest";
import { resolveEntitlement, isPremium } from "./entitlement.js";

const future = new Date(Date.now() + 86400000);
const past = new Date(Date.now() - 86400000);

describe("resolveEntitlement", () => {
  it("active subscription with a future period end is active", () => {
    expect(resolveEntitlement({ status: "active", currentPeriodEnd: future, trialEnd: null })).toBe("active");
  });
  it("expired subscription but live trial is trialing", () => {
    expect(resolveEntitlement({ status: "canceled", currentPeriodEnd: past, trialEnd: future })).toBe("trialing");
  });
  it("a Stripe trialing subscription is premium (card-on-file trial)", () => {
    expect(resolveEntitlement({ status: "trialing", currentPeriodEnd: null, trialEnd: null })).toBe("trialing");
  });
  it("no subscription and no live trial is free", () => {
    expect(resolveEntitlement({ status: null, currentPeriodEnd: null, trialEnd: past })).toBe("free");
  });
  it("active status but a past period end falls through to trial/free", () => {
    expect(resolveEntitlement({ status: "active", currentPeriodEnd: past, trialEnd: null })).toBe("free");
  });
});

describe("isPremium", () => {
  it("active and trialing are premium; free is not", () => {
    expect(isPremium("active")).toBe(true);
    expect(isPremium("trialing")).toBe(true);
    expect(isPremium("free")).toBe(false);
  });
});
