import { describe, it, expect } from "vitest";
import { holdingWater } from "./holding-water.js";

describe("holdingWater", () => {
  it("tailwater + low gradient + confluence => deep pool, high score", () => {
    const r = holdingWater({ isTailwater: true, waterType: "river", gradientPct: 0.1, sinuosity: 1.4, nearConfluence: true, belowLake: false });
    expect(r.poolScore).toBeGreaterThan(65);
    expect(["pool", "deep-pool"]).toContain(r.class);
    expect(r.deepHole).toBe(true);
    expect(r.drivers.length).toBeGreaterThan(0);
  });
  it("steep straight stream => riffle, low score", () => {
    const r = holdingWater({ isTailwater: false, waterType: "stream", gradientPct: 3.5, sinuosity: 1.02, nearConfluence: false, belowLake: false });
    expect(r.poolScore).toBeLessThan(40);
    expect(r.class).toBe("riffle");
  });
  it("sounded depth overrides the model", () => {
    const r = holdingWater({ isTailwater: false, waterType: "river", gradientPct: 2, sinuosity: 1, nearConfluence: false, belowLake: false, soundedMaxDepthM: 8 });
    expect(r.deepHole).toBe(true);
    expect(r.class).toBe("deep-pool");
    expect(r.drivers).toContain("sounded depth 8 m");
  });
});
