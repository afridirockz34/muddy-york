import { describe, it, expect } from "vitest";
import { flowNews } from "./flow-news.js";

const reading = (num, name, dt, q) => ({ properties: { STATION_NUMBER: num, STATION_NAME: name, DATETIME: dt, DISCHARGE: q } });

describe("flowNews", () => {
  const rivers = ["Credit River", "Grand River", "Twelve Mile Creek"];

  it("reports a river that is rising beyond the threshold", () => {
    const json = { features: [
      reading("A", "CREDIT RIVER AT STREETSVILLE", "2026-08-01T00:00:00Z", 10),
      reading("A", "CREDIT RIVER AT STREETSVILLE", "2026-08-01T20:00:00Z", 13),
    ] };
    const out = flowNews(json, { rivers });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ river: "Credit River", pct: 30, discharge: 13 });
  });

  it("ignores stations that don't match a covered river", () => {
    const json = { features: [
      reading("B", "SPEED RIVER NEAR GUELPH", "2026-08-01T00:00:00Z", 5),
      reading("B", "SPEED RIVER NEAR GUELPH", "2026-08-01T20:00:00Z", 9),
    ] };
    expect(flowNews(json, { rivers })).toHaveLength(0);
  });

  it("ignores changes under the threshold", () => {
    const json = { features: [
      reading("C", "GRAND RIVER AT FERGUS", "2026-08-01T00:00:00Z", 100),
      reading("C", "GRAND RIVER AT FERGUS", "2026-08-01T20:00:00Z", 105), // +5%
    ] };
    expect(flowNews(json, { rivers, minPct: 15 })).toHaveLength(0);
  });

  it("keeps only the biggest mover per river", () => {
    const json = { features: [
      reading("D", "CREDIT RIVER AT STREETSVILLE", "2026-08-01T00:00:00Z", 10),
      reading("D", "CREDIT RIVER AT STREETSVILLE", "2026-08-01T20:00:00Z", 12), // +20%
      reading("E", "CREDIT RIVER NEAR ORANGEVILLE", "2026-08-01T00:00:00Z", 10),
      reading("E", "CREDIT RIVER NEAR ORANGEVILLE", "2026-08-01T20:00:00Z", 15), // +50%
    ] };
    const out = flowNews(json, { rivers });
    expect(out).toHaveLength(1);
    expect(out[0].pct).toBe(50);
  });

  it("matches multi-word creek names", () => {
    const json = { features: [
      reading("F", "TWELVE MILE CREEK BELOW ST CATHARINES", "2026-08-01T00:00:00Z", 2),
      reading("F", "TWELVE MILE CREEK BELOW ST CATHARINES", "2026-08-01T20:00:00Z", 3),
    ] };
    expect(flowNews(json, { rivers })[0].river).toBe("Twelve Mile Creek");
  });
});
