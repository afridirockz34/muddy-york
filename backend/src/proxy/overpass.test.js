import { describe, it, expect } from "vitest";
import { buildDiscoverQuery, buildParkingQuery } from "./overpass.js";

describe("overpass queries", () => {
  it("discover query targets access + named waterways in radius", () => {
    const q = buildDiscoverQuery(43.7, -80.3, 30000);
    expect(q).toContain('leisure"="fishing"');
    expect(q).toContain('waterway"="river"');
    expect(q).toContain("around:30000,43.7,-80.3");
    expect(q).toContain("out tags geom 200;");
  });
  it("parking query targets amenity=parking + slipway", () => {
    const q = buildParkingQuery(43.7, -80.3);
    expect(q).toContain('amenity"="parking"');
    expect(q).toContain('leisure"="slipway"');
    expect(q).toContain("around:1500,43.7,-80.3");
  });
});
