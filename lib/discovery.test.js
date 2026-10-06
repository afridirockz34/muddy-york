import { describe, it, expect } from "vitest";
import { buildOverpassQuery, parseOverpassSpots, nearGreatLakeKm } from "./discovery.js";

describe("buildOverpassQuery", () => {
  it("includes access, dams, named waterways and towns within radius, uncapped", () => {
    const q = buildOverpassQuery(43.7, -80.3, 30000);
    expect(q).toContain('leisure"="fishing"');
    expect(q).toContain('waterway"~"^(dam|weir)$"');
    expect(q).toContain('place"~');
    expect(q).not.toMatch(/out[^;]* \d+;/);
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
  it("keeps fishing access on rivers, drops launches and lake access", () => {
    const river = { type: "way", id: 9, tags: { waterway: "river", name: "Grand River" }, geometry: [{ lat: 43.72, lon: -80.32 }, { lat: 43.73, lon: -80.33 }] };
    const json = { elements: [
      river,
      { type: "node", id: 3, lat: 43.7201, lon: -80.3201, tags: { leisure: "fishing" } },
      { type: "node", id: 4, lat: 43.72, lon: -80.32, tags: { leisure: "slipway" } },
      { type: "node", id: 5, lat: 43.7202, lon: -80.3202, tags: { leisure: "fishing", name: "Belwood Lake boat launch" } },
      { type: "node", id: 6, lat: 43.90, lon: -80.10, tags: { leisure: "fishing" } },
    ] };
    const spots = parseOverpassSpots(json, loc);
    const access = spots.filter((s) => s.kind === "access");
    expect(access.map((s) => s.name)).toEqual(["Grand River access"]);
    expect(spots.some((s) => s.kind === "slipway")).toBe(false);
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

describe("parseOverpassSpots: more spots, stable ids", () => {
  const loc = { lat: 43.70, lon: -80.30 };
  // A river running ~25 km north-south past the angler.
  const geometry = Array.from({ length: 60 }, (_, i) => ({ lat: 43.60 + i * 0.004, lon: -80.30 }));
  const json = { elements: [
    { type: "way", id: 1, tags: { waterway: "river", name: "Long River" }, geometry },
    { type: "way", id: 2, tags: { waterway: "stream", name: "Cold Creek" }, center: { lat: 43.71, lon: -80.28 } },
    { type: "way", id: 3, tags: { waterway: "stream", name: "Cold Creek" }, center: { lat: 43.75, lon: -80.25 } },
    { type: "way", id: 4, tags: { waterway: "stream", name: "Mill Storm Sewer" }, center: { lat: 43.70, lon: -80.29 } },
    { type: "node", id: 9, lat: 43.705, lon: -80.31, tags: { place: "village", name: "Elmvale" } },
  ] };
  it("gives a long river several spaced spots, labelled with the nearest town", () => {
    const river = parseOverpassSpots(json, loc).filter((s) => s.name === "Long River");
    expect(river.length).toBeGreaterThan(1);
    expect(river.length).toBeLessThanOrEqual(4);
    expect(river[0].near).toBe("Elmvale");
  });
  it("keeps creeks from centre points and drops storm sewers", () => {
    const spots = parseOverpassSpots(json, loc);
    expect(spots.filter((s) => s.name === "Cold Creek")).toHaveLength(2);
    expect(spots.some((s) => /Sewer/.test(s.name))).toBe(false);
  });
  it("returns the same ids when scouting again from a few km away", () => {
    const a = parseOverpassSpots(json, loc).map((s) => s.id);
    const b = parseOverpassSpots(json, { lat: 43.71, lon: -80.31 }).map((s) => s.id);
    expect(b.filter((id) => a.includes(id)).length).toBeGreaterThanOrEqual(Math.min(a.length, b.length) - 1);
  });
  it("honours the radius", () => {
    const near = parseOverpassSpots(json, loc, 3000);
    expect(near.every((s) => Math.abs(s.lat - 43.70) < 0.03)).toBe(true);
  });
});

describe("nearGreatLakeKm", () => {
  it("is small near Lake Ontario shoreline and large far inland", () => {
    expect(nearGreatLakeKm(43.62, -79.38)).toBeLessThan(30); // Toronto lakeshore
    expect(nearGreatLakeKm(45.5, -78.0)).toBeGreaterThan(60); // Algonquin-ish
  });
});

import { tileOf, tilesFor, tileCandidates, selectSpots, buildTileQuery } from "./discovery.js";
describe("shared tiles", () => {
  it("indexes and lists tiles nearest first", () => {
    expect(tileOf(43.7, -79.6)).toEqual({ i: 174, j: -319 });
    const t = tilesFor({ lat: 43.7, lon: -79.6 }, 30000);
    expect(t[0]).toMatchObject({ i: 174, j: -319, d: 0 });
    expect(t.length).toBeGreaterThan(4);
    expect(buildTileQuery({ i: 174, j: -319 })).toContain("43.480,-79.770,43.770,-79.480");
  });
  it("tile candidates + selection match a direct parse", () => {
    const geometry = Array.from({ length: 60 }, (_, i) => ({ lat: 43.53 + i * 0.003, lon: -79.62 }));
    const json = { elements: [{ type: "way", id: 1, tags: { waterway: "river", name: "Long River" }, geometry }] };
    const cands = tileCandidates(json, { i: 174, j: -319 });
    expect(cands.length).toBeGreaterThan(3);
    const loc = { lat: 43.6, lon: -79.62 };
    const picked = selectSpots(cands, loc, 30000);
    const direct = parseOverpassSpots(json, loc, 30000).filter((s) => s.lat < 43.75);
    expect(picked.length).toBeLessThanOrEqual(4);
    expect(picked.map((s) => s.id)).toEqual(direct.map((s) => s.id).slice(0, picked.length));
  });
});
