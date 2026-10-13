import { describe, it, expect } from "vitest";
import { freezingDegreeDays, freezeStage, iceOutlook, iceSpeciesIn } from "./ice.js";

describe("ice", () => {
  it("adds up freezing degree-days and resets after a long thaw", () => {
    expect(freezingDegreeDays([-5, -10, -3, 1])).toBe(18);
    expect(freezingDegreeDays([-20, -20, 5, 5, 5, 5, 5, -4])).toBe(4);
  });
  it("names the stage by weather, never by safety", () => {
    for (const f of [20, 180, 400]) expect(JSON.stringify(freezeStage(f))).not.toMatch(/safe/i);
    expect(freezeStage(20).stage).toBe("early");
  });
  it("only gives an outlook once it's been cold enough", () => {
    expect(iceOutlook({ fdd: 50, openCount: 3, presentCount: 3 })).toBe(null);
    const calm = iceOutlook({ fdd: 300, openCount: 3, presentCount: 3, wind: 8, air: -8, pressureTrend: 0 });
    const gale = iceOutlook({ fdd: 300, openCount: 3, presentCount: 3, wind: 45, air: -25, pressureTrend: -5 });
    expect(calm.score).toBeGreaterThan(gale.score);
  });
  it("reads ice species from a survey list", () => {
    expect(iceSpeciesIn("Walleye,Yellow Perch,Pikes,Black Crappie,Cisco")).toEqual(["WAL", "YP", "NP", "CRP", "CIS"]);
  });
});
