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
  it("active status is premium even when currentPeriodEnd is missing (newer webhook payloads)", () => {
    expect(resolveEntitlement({ status: "active", currentPeriodEnd: null, trialEnd: null })).toBe("active");
  });
  it("active status stays premium even if a stored period end looks stale (trust Stripe)", () => {
    expect(resolveEntitlement({ status: "active", currentPeriodEnd: past, trialEnd: null })).toBe("active");
  });
  it("past-due within the known paid period keeps access (retry grace)", () => {
    expect(resolveEntitlement({ status: "past_due", currentPeriodEnd: future, trialEnd: null })).toBe("active");
    expect(resolveEntitlement({ status: "past_due", currentPeriodEnd: past, trialEnd: null })).toBe("free");
  });
  it("canceled with the paid period already over is free", () => {
    expect(resolveEntitlement({ status: "canceled", currentPeriodEnd: past, trialEnd: null })).toBe("free");
  });
});

describe("isPremium", () => {
  it("active and trialing are premium; free is not", () => {
    expect(isPremium("active")).toBe(true);
    expect(isPremium("trialing")).toBe(true);
    expect(isPremium("free")).toBe(false);
  });
});
