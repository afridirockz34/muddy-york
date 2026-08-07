import { describe, it, expect } from "vitest";
import { shouldAlert } from "./decide.js";
const now = new Date("2026-05-15T08:00:00Z");

describe("shouldAlert", () => {
  it("alerts when at/above threshold and never alerted", () => {
    expect(shouldAlert({ opportunity: 80, threshold: 75, lastAlertAt: null }, now)).toBe(true);
  });
  it("does not alert below threshold", () => {
    expect(shouldAlert({ opportunity: 60, threshold: 75, lastAlertAt: null }, now)).toBe(false);
  });
  it("respects the cooldown", () => {
    const recent = new Date(now.getTime() - 2 * 3600000);
    expect(shouldAlert({ opportunity: 90, threshold: 75, lastAlertAt: recent }, now)).toBe(false);
    const old = new Date(now.getTime() - 30 * 3600000);
    expect(shouldAlert({ opportunity: 90, threshold: 75, lastAlertAt: old }, now)).toBe(true);
  });
});
