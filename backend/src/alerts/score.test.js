import { describe, it, expect } from "vitest";
import { scoreSpot, modelStreamTemp } from "./score.js";

const habitat = { hold: 88, struct: 80, spawn: 70, cold: 95, ox: 86, gw: 60 };

describe("modelStreamTemp", () => {
  it("cold reaches stay colder than warm ones for the same air temp", () => {
    expect(modelStreamTemp(95, 22)).toBeLessThan(modelStreamTemp(40, 22));
  });
});

describe("scoreSpot", () => {
  it("scores higher in cool water than warm water", () => {
    const cool = scoreSpot({ habitat, species: ["BNT"], history: 90 },
      { airMean: 12, days: 4, flow: "Normal" }, new Date("2026-05-15T08:00:00Z"));
    const warm = scoreSpot({ habitat, species: ["BNT"], history: 90 },
      { airMean: 28, days: 4, flow: "Normal" }, new Date("2026-05-15T08:00:00Z"));
    expect(cool).toBeGreaterThan(warm);
    expect(cool).toBeGreaterThanOrEqual(0);
    expect(cool).toBeLessThanOrEqual(100);
  });
});
