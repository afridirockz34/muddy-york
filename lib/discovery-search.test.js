import { describe, it, expect } from "vitest";
import { searchWords, nameMatches, searchSpots } from "./discovery.js";

const reach = (name, lat, lon, extra = {}) => ({ id: `r:${name}:${lat}:${lon}`, name, lat, lon, waterType: "river", kind: "reach", near: "Town", ...extra });

describe("river search", () => {
  it("ignores generic words and plurals", () => {
    expect(searchWords("Credit Rivers")).toEqual(["credit"]);
    expect(searchWords("river")).toEqual([]);
    expect(nameMatches("Credit River", searchWords("credit rivers"))).toBe(true);
    expect(nameMatches("Credit River", searchWords("cred"))).toBe(true);
    expect(nameMatches("Sixteen Mile Creek", searchWords("sixteen mile"))).toBe(true);
    expect(nameMatches("Saugeen River", searchWords("sauble"))).toBe(false);
  });

  it("returns every spaced spot on the matching river, upstream first", () => {
    const cands = [];
    for (let k = 0; k < 10; k++) cands.push(reach("Credit River", 43.55 + k * 0.04, -79.6 - k * 0.03));
    cands.push(reach("Humber River", 43.7, -79.5));
    const r = searchSpots(cands, "credit river");
    expect(r).toHaveLength(1);
    expect(r[0].name).toBe("Credit River");
    expect(r[0].spots.length).toBeGreaterThan(5);
    expect(r[0].spots[0].lat).toBeGreaterThan(r[0].spots.at(-1).lat);
  });

  it("keeps far-apart waters with the same name separate, and puts access points in", () => {
    const cands = [reach("Mill Creek", 43.5, -80.3, { waterType: "stream" }), reach("Mill Creek", 44.6, -79.4, { waterType: "stream", near: "Orillia" }),
      { id: "n1", name: "Credit River access", river: "Credit River", lat: 43.6, lon: -79.7, kind: "access", waterType: "river" }, reach("Credit River", 43.62, -79.72)];
    expect(searchSpots(cands, "mill")).toHaveLength(2);
    const credit = searchSpots(cands, "credit")[0];
    expect(credit.spots.some((s) => s.kind === "access")).toBe(true);
  });

  it("puts the exact name first", () => {
    const cands = [reach("Credit Creek", 44, -80, { waterType: "stream" }), reach("Credit River", 43.6, -79.7)];
    expect(searchSpots(cands, "credit river")[0].name).toBe("Credit River");
  });
});
