import { describe, it, expect } from "vitest";
import { inferSpecies } from "./species-inference.js";

describe("inferSpecies", () => {
  it("cold high-elevation small stream => resident trout", () => {
    const r = inferSpecies({ waterType: "stream", elevationM: 420, nearGreatLakeKm: 80, isTailwater: false });
    expect(r[0]).toBe("BKT");
    expect(r).toContain("BNT");
  });
  it("river near a Great Lake => steelhead/salmon run water", () => {
    const r = inferSpecies({ waterType: "river", elevationM: 90, nearGreatLakeKm: 6, isTailwater: false });
    expect(r).toContain("STL");
    expect(r).toContain("CHN");
  });
  it("tailwater => cold resident trout", () => {
    const r = inferSpecies({ waterType: "river", elevationM: 200, nearGreatLakeKm: 60, isTailwater: true });
    expect(r[0]).toBe("BNT");
    expect(r).toContain("RBT");
  });
  it("lake => warmwater set", () => {
    const r = inferSpecies({ waterType: "lake", elevationM: 180, nearGreatLakeKm: null, isTailwater: false });
    expect(r).toEqual(expect.arrayContaining(["SMB", "WAL", "NP", "PAN"]));
  });
});
