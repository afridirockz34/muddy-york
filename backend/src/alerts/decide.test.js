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

import { decideSpot, userCanReceive } from "./decide.js";
describe("decideSpot (edge-triggered)", () => {
  it("fires once on the crossing, then disarms", () => {
    expect(decideSpot({ opportunity: 80, threshold: 75, armed: true }, now)).toEqual({ send: true, armed: false });
    expect(decideSpot({ opportunity: 90, threshold: 75, armed: false }, now)).toEqual({ send: false, armed: false });
  });
  it("hovering just under the threshold does not re-arm", () => {
    expect(decideSpot({ opportunity: 70, threshold: 75, armed: false }, now)).toEqual({ send: false, armed: false });
  });
  it("re-arms after dropping clearly below", () => {
    expect(decideSpot({ opportunity: 60, threshold: 75, armed: false }, now)).toEqual({ send: false, armed: true });
  });
  it("caps at two alerts per river per week", () => {
    const log = [new Date(now - 2 * 864e5).toISOString(), new Date(now - 4 * 864e5).toISOString()];
    expect(decideSpot({ opportunity: 90, threshold: 75, armed: true, log }, now).send).toBe(false);
    const old = [new Date(now - 9 * 864e5).toISOString(), new Date(now - 4 * 864e5).toISOString()];
    expect(decideSpot({ opportunity: 90, threshold: 75, armed: true, log: old }, now).send).toBe(true);
  });
  it("one message per user per 12 h", () => {
    expect(userCanReceive(null, now)).toBe(true);
    expect(userCanReceive(new Date(now - 3 * 3600000), now)).toBe(false);
    expect(userCanReceive(new Date(now - 13 * 3600000), now)).toBe(true);
  });
});
