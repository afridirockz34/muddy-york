import { describe, it, expect } from "vitest";
import { parseStocking } from "./stocking.js";

const loc = { lat: 43.7, lon: -80.0 };
const feat = (sp, yr, lon, lat) => ({ attributes: { SPECIES: sp, STOCK_YEAR: yr, DEVELOPMENT_STAGE: "Yearling" }, geometry: { x: lon, y: lat } });

describe("parseStocking", () => {
  it("returns nearest-first events with yearsAgo", () => {
    const json = { features: [feat("Brown Trout", 2022, -80.01, 43.71), feat("Rainbow Trout", 2020, -80.3, 44.0)] };
    const r = parseStocking(json, loc, 2026);
    expect(r.events[0].species).toBe("Brown Trout");
    expect(r.events[0].yearsAgo).toBe(4);
    expect(r.events[0].distanceKm).toBeLessThan(r.events[1].distanceKm);
  });
  it("null on empty", () => { expect(parseStocking({ features: [] }, loc, 2026)).toBe(null); });
});
