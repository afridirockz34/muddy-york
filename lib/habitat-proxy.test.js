import { describe, it, expect } from "vitest";
import { deriveHabitat } from "./habitat-proxy.js";

describe("deriveHabitat", () => {
  it("cold water rises with elevation and tailwater", () => {
    const low = deriveHabitat({ waterType: "river", elevationM: 90, nearGreatLakeKm: 8, isTailwater: false });
    const high = deriveHabitat({ waterType: "stream", elevationM: 450, nearGreatLakeKm: 90, isTailwater: false });
    const tail = deriveHabitat({ waterType: "river", elevationM: 200, nearGreatLakeKm: 60, isTailwater: true });
    expect(high.cold).toBeGreaterThan(low.cold);
    expect(tail.cold).toBeGreaterThan(low.cold);
  });
  it("returns all six facets within 0..100", () => {
    const h = deriveHabitat({ waterType: "lake", elevationM: 180, nearGreatLakeKm: null, isTailwater: false });
    for (const k of ["hold", "struct", "spawn", "cold", "ox", "gw"]) {
      expect(h[k]).toBeGreaterThanOrEqual(0);
      expect(h[k]).toBeLessThanOrEqual(100);
    }
  });
});
