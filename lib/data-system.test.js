import { describe, it, expect } from "vitest";
import { runSummary, RUN_SPOTS } from "./run-spots.js";
import { coldWaterIndex, surveyedTroutSalmon } from "./cold-water.js";
import { scoreAccuracy } from "./score-accuracy.js";
import { SALMON_SPOTS } from "../marketing/seo-content.mjs";

const now = Date.parse("2026-10-12T12:00:00Z");
const ago = (d) => new Date(now - d * 864e5).toISOString();

describe("run tracker", () => {
  it("every run spot has a public salmon page and vice versa", () => {
    expect(RUN_SPOTS.map((s) => s.slug).sort()).toEqual(SALMON_SPOTS.map((s) => s.slug).sort());
  });
  it("summarizes the most-reported recent state", () => {
    const s = runSummary([{ status: "moving", createdAt: ago(1) }, { status: "moving", createdAt: ago(2) }, { status: "staging", createdAt: ago(1) }, { status: "spawning", createdAt: ago(6) }], now);
    expect(s).toMatchObject({ state: "moving", reports7: 4 });
    expect(runSummary([{ status: "spent", createdAt: ago(20) }], now)).toMatchObject({ state: null, reports7: 0 });
  });
});

describe("cold-water index", () => {
  it("leans on the official class and adjusts with member summer temps", () => {
    expect(coldWaterIndex({ thermal: "Cold", habitatCold: 80 }).label).toBe("Cold water");
    expect(coldWaterIndex({ thermal: "Warm", habitatCold: 50 }).label).toBe("Warm in summer");
    const hot = coldWaterIndex({ thermal: "Cool", habitatCold: 60, memberTemps: [23, 24], month: 7 });
    expect(hot.index).toBeLessThan(coldWaterIndex({ thermal: "Cool", habitatCold: 60, month: 7 }).index);
    expect(coldWaterIndex({})).toBe(null);
    expect(coldWaterIndex({ habitatCold: 70 }).source).toBe("model");
  });
  it("reads trout and salmon from survey lists", () => {
    expect(surveyedTroutSalmon("Blacknose Dace,Brook Trout,Brown Trout,Rainbow Trout", { nearGreatLakeKm: 10 })).toEqual(["BKT", "BNT", "STL"]);
    expect(surveyedTroutSalmon("Creek Chub")).toEqual([]);
  });
});

describe("score accuracy", () => {
  it("bands trips by the score we showed", () => {
    const r = scoreAccuracy([
      { fished: true, scoreAtTrip: 85, caught: 2 }, { fished: true, scoreAtTrip: 90, caught: 0 },
      { fished: true, scoreAtTrip: 50, caught: 0 }, { fished: false, scoreAtTrip: 90, caught: 0 },
    ]);
    expect(r.trips).toBe(3);
    expect(r.bands[0]).toEqual({ label: "80+", trips: 2, caughtRate: 50 });
    expect(r.ready).toBe(false);
  });
});
