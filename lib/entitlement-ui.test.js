import { describe, it, expect } from "vitest";
import { entitlementLabel, isPremiumMe, planPrice } from "./entitlement-ui.js";

describe("entitlement-ui", () => {
  it("labels states", () => {
    expect(entitlementLabel(null)).toBe("Sign in");
    expect(entitlementLabel({ user: {}, entitlement: "active" })).toBe("Member");
    expect(entitlementLabel({ user: {}, entitlement: "trialing" })).toBe("Trial");
    expect(entitlementLabel({ user: {}, entitlement: "free" })).toBe("Free");
  });
  it("premium check", () => {
    expect(isPremiumMe({ entitlement: "trialing" })).toBe(true);
    expect(isPremiumMe({ entitlement: "free" })).toBe(false);
    expect(isPremiumMe(null)).toBe(false);
  });
  it("plan price", () => {
    expect(planPrice("annual")).toContain("59.99");
    expect(planPrice("monthly")).toContain("9.99");
  });
});
