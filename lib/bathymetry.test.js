import { describe, it, expect } from "vitest";
import { buildBathyUrl, parseBathy } from "./bathymetry.js";

describe("bathymetry", () => {
  it("builds a bbox query with DEPTH", () => {
    const u = buildBathyUrl(44.4, -79.5, 0.02);
    expect(u).toContain("MapServer/30/query");
    expect(u).toContain("outFields=DEPTH");
    expect(u).toContain("-79.52,44.38,-79.48,44.42");
  });
  it("returns positive max depth + deepHole", () => {
    const json = { features: [{ attributes: { DEPTH: -2 } }, { attributes: { DEPTH: -29 } }, { attributes: { DEPTH: -5 } }] };
    const r = parseBathy(json);
    expect(r.maxDepthM).toBe(29);
    expect(r.contourCount).toBe(3);
    expect(r.deepHole).toBe(true);
  });
  it("null when no contours", () => { expect(parseBathy({ features: [] })).toBe(null); });
});
