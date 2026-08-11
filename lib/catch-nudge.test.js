import { describe, it, expect } from "vitest";
import { catchNudge, momentumFrom } from "./catch-nudge.js";

const now = new Date("2026-08-10T12:00:00Z");

describe("catch nudge", () => {
  it("bounds the nudge to 0..6", () => {
    expect(catchNudge(0)).toBe(0);
    expect(catchNudge(1)).toBe(6);
    expect(catchNudge(0.5)).toBeGreaterThan(0);
    expect(catchNudge(5)).toBe(6);
  });
  it("momentum: recent+frequent high, old ~0", () => {
    const recent = ["2026-08-09", "2026-08-07", "2026-08-05"].map((d) => d + "T12:00:00Z");
    const old = ["2026-01-01", "2025-11-01"].map((d) => d + "T12:00:00Z");
    expect(momentumFrom(recent, now)).toBeGreaterThan(momentumFrom(old, now));
    expect(momentumFrom(old, now)).toBeLessThan(0.2);
    expect(momentumFrom([], now)).toBe(0);
  });
});
