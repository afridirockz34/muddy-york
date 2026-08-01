import { describe, it, expect } from "vitest";
import { buildOverpassQuery, parseOverpassSpots, nearGreatLakeKm } from "./discovery.js";

describe("buildOverpassQuery", () => {
  it("includes access, slipway, dam and named waterways within radius", () => {
    const q = buildOverpassQuery(43.7, -80.3, 30000);
    expect(q).toContain('leisure"="fishing"');
    expect(q).toContain('leisure"="slipway"');
    expect(q).toContain('waterway"="dam"');
    expect(q).toContain("around:30000,43.7,-80.3");
  });
});

describe("parseOverpassSpots", () => {
  const loc = { lat: 43.70, lon: -80.30 };
  it("keeps a named river reach as one representative point", () => {
    const json = { elements: [
      { type: "way", id: 1, tags: { waterway: "river", name: "Grand River" },
        geometry: [ { lat: 43.71, lon: -80.31 }, { lat: 43.72, lon: -80.33 } ] },
    ] };
    const spots = parseOverpassSpots(json, loc);
    expect(spots).toHaveLength(1);
    expect(spots[0].name).toBe("Grand River");
    expect(spots[0].kind).toBe("reach");
    expect(spots[0].waterType).toBe("river");
  });
  it("drops unnamed streams", () => {
    const json = { elements: [
      { type: "way", id: 2, tags: { waterway: "stream" },
        geometry: [ { lat: 43.71, lon: -80.31 } ] },
    ] };
    expect(parseOverpassSpots(json, loc)).toHaveLength(0);
  });
  it("keeps fishing access and slipway nodes", () => {
    const json = { elements: [
      { type: "node", id: 3, lat: 43.71, lon: -80.31, tags: { leisure: "fishing", name: "The Bend" } },
      { type: "node", id: 4, lat: 43.72, lon: -80.32, tags: { leisure: "slipway" } },
    ] };
    const spots = parseOverpassSpots(json, loc);
    expect(spots.map((s) => s.kind).sort()).toEqual(["access", "slipway"]);
  });
  it("flags a reach immediately below a dam as tailwater", () => {
    const json = { elements: [
      { type: "node", id: 5, lat: 43.710, lon: -80.310, tags: { waterway: "dam" } },
      { type: "way", id: 6, tags: { waterway: "river", name: "Below Dam River" },
        geometry: [ { lat: 43.7105, lon: -80.3105 }, { lat: 43.715, lon: -80.32 } ] },
    ] };
    const reach = parseOverpassSpots(json, loc).find((s) => s.kind === "reach");
    expect(reach.isTailwater).toBe(true);
  });
});

describe("nearGreatLakeKm", () => {
  it("is small near Lake Ontario shoreline and large far inland", () => {
    expect(nearGreatLakeKm(43.62, -79.38)).toBeLessThan(30); // Toronto lakeshore
    expect(nearGreatLakeKm(45.5, -78.0)).toBeGreaterThan(60); // Algonquin-ish
  });
});
