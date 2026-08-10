import { describe, it, expect } from "vitest";
import { estimateFish } from "./fish-estimate.js";

const deep = { poolScore: 80, class: "deep-pool", deepHole: true, drivers: ["tailwater plunge pool"] };
const riffle = { poolScore: 30, class: "riffle", deepHole: false, drivers: [] };

describe("estimateFish", () => {
  it("deep cold pool + older stocking => larger fish, age noted", () => {
    const r = estimateFish({ species: ["BNT"], holding: deep, stocking: { species: "Brown trout", yearsAgo: 4 }, coldRetention: 90, month: 4 });
    expect(r.sizeClass).toBe("larger");
    expect(r.ageEstimate).toMatch(/yr|year/);
    expect(r.rationale.join(" ")).toMatch(/deep|hold|stock/i);
  });
  it("shallow warm riffle => small/young", () => {
    const r = estimateFish({ species: ["BKT"], holding: riffle, stocking: null, coldRetention: 30, month: 7 });
    expect(r.sizeClass).toBe("small");
  });
  it("stocked species is surfaced first", () => {
    const r = estimateFish({ species: ["RBT"], holding: deep, stocking: { species: "Brown trout", yearsAgo: 2 }, coldRetention: 80, month: 5 });
    expect(r.species[0].key).toBeTruthy();
  });
});
