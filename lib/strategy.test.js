import { describe, it, expect } from "vitest";
import { rankTechniques, reasonText, lightOf } from "./strategy.js";

const at = (h) => new Date(2026, 9, 15, h);
const sun = { sunrise: new Date(2026, 9, 15, 7, 20).toISOString(), sunset: new Date(2026, 9, 15, 18, 40).toISOString() };
const pick = (o) => rankTechniques({ wind: 10, pressureTrend: 0, ...sun, ...o })[0].tech;

describe("rankTechniques", () => {
  it("drifts eggs for running fish in stained water", () => {
    expect(pick({ temp: 10, flow: "High / stained", cloud: 50, now: at(12), species: "STL", run: true, season: "Fall" })).toBe("eggs");
  });
  it("swings for steelhead on normal flow in low light", () => {
    expect(pick({ temp: 9, flow: "Normal", cloud: 50, now: at(7), species: "STL", run: true, season: "Fall" })).toBe("swing");
  });
  it("strips streamers for coho", () => {
    expect(pick({ temp: 11, flow: "Normal", cloud: 90, now: at(12), species: "COH", run: true, season: "Fall" })).toBe("streamer");
  });
  it("nymphs resident trout in cold water", () => {
    expect(pick({ temp: 5, flow: "Normal", cloud: 50, now: at(12), species: "BNT", run: false, season: "Spring" })).toBe("nymphing");
  });
  it("fishes a dry in prime, clear water on a calm evening", () => {
    expect(pick({ temp: 16, flow: "Low / clear", cloud: 20, now: at(19), species: "BNT", run: false, season: "Summer" })).toBe("dry");
  });
  it("throws streamers when the river is blown out", () => {
    expect(pick({ temp: 12, flow: "Blown out", cloud: 90, now: at(12), species: "BNT", run: false, season: "Spring" })).toBe("streamer");
    expect(pick({ temp: 12, flow: "Blown out", cloud: 90, now: at(12), species: "STL", run: true, season: "Spring" })).toBe("streamer");
  });
  it("explains the pick with real reasons and no dashes", () => {
    const top = rankTechniques({ temp: 10, flow: "High / stained", cloud: 50, now: at(12), species: "STL", run: true, season: "Fall", ...sun })[0];
    const why = reasonText(top);
    expect(why).toMatch(/^Colour in the water/);
    expect(why).not.toMatch(/—/);
  });
  it("gives different answers as conditions change (not one technique everywhere)", () => {
    const seen = new Set();
    for (const flow of ["Normal", "High / stained", "Low / clear"]) for (const h of [7, 13, 19]) for (const temp of [4, 10, 16])
      for (const run of [true, false]) seen.add(pick({ temp, flow, cloud: 50, now: at(h), species: run ? "STL" : "BNT", run, season: "Fall" }));
    expect(seen.size).toBeGreaterThanOrEqual(5);
  });
});

describe("lightOf", () => {
  it("knows dawn, midday and night", () => {
    expect(lightOf({ now: at(7), ...sun, cloud: 10 }).lowSun).toBe(true);
    expect(lightOf({ now: at(13), ...sun, cloud: 10 }).bright).toBe(true);
    expect(lightOf({ now: at(13), ...sun, cloud: 90 }).overcast).toBe(true);
  });
});
