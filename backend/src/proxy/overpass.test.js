import { describe, it, expect } from "vitest";
import { buildDiscoverQuery, buildParkingQuery } from "./overpass.js";

describe("overpass queries", () => {
  it("discover query targets access + named waterways in radius", () => {
    const q = buildDiscoverQuery(43.7, -80.3, 30000);
    expect(q).toContain('leisure"="fishing"');
    expect(q).toContain('waterway"="river"');
    expect(q).toContain("around:30000,43.7,-80.3");
    expect(q).toContain("out tags geom;");
  });
  it("parking query targets amenity=parking + slipway", () => {
    const q = buildParkingQuery(43.7, -80.3);
    expect(q).toContain('amenity"="parking"');
    expect(q).toContain('leisure"="slipway"');
    expect(q).toContain("around:1500,43.7,-80.3");
  });
});

describe("compactDiscover", () => {
  it("thins river outlines and drops unused tags", async () => {
    const { compactDiscover } = await import("../routes/proxy.js");
    const geometry = Array.from({ length: 100 }, (_, i) => ({ lat: 43.7 + i * 0.0001, lon: -80.3 }));
    const out = compactDiscover({ elements: [
      { type: "way", id: 1, tags: { waterway: "river", name: "R", source: "x", "name:fr": "y" }, geometry },
      { type: "node", id: 2, lat: 43.123456789, lon: -80.1, tags: { leisure: "fishing" } },
    ] });
    expect(out.elements[0].tags).toEqual({ waterway: "river", name: "R" });
    expect(out.elements[0].geometry.length).toBeLessThan(10);
    expect(out.elements[0].geometry.at(-1).lat).toBeCloseTo(43.7099, 4);
    expect(out.elements[1].lat).toBe(43.12346);
  });
});
