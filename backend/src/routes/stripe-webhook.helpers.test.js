import { describe, it, expect } from "vitest";
import { ignoreStaleSubEvent } from "./stripe-webhook.js";

describe("ignoreStaleSubEvent", () => {
  it("ignores a terminal event for a DIFFERENT (old) subscription", () => {
    // User re-subscribed: tracked row is sub_new; a late delete of sub_old arrives.
    expect(ignoreStaleSubEvent("sub_new", "sub_old", "canceled")).toBe(true);
    expect(ignoreStaleSubEvent("sub_new", "sub_old", "unpaid")).toBe(true);
  });
  it("applies a terminal event for the CURRENTLY tracked subscription", () => {
    expect(ignoreStaleSubEvent("sub_new", "sub_new", "canceled")).toBe(false);
  });
  it("applies active/trialing events regardless of id (they become current)", () => {
    expect(ignoreStaleSubEvent("sub_old", "sub_new", "active")).toBe(false);
    expect(ignoreStaleSubEvent("sub_old", "sub_new", "trialing")).toBe(false);
  });
  it("applies the first subscription when nothing is tracked yet", () => {
    expect(ignoreStaleSubEvent(null, "sub_1", "canceled")).toBe(false);
    expect(ignoreStaleSubEvent(undefined, "sub_1", "active")).toBe(false);
  });
});
