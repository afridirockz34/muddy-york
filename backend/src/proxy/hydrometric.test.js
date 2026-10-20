import { describe, it, expect } from "vitest";
import { buildHydroUrl, parseGauges, nearestGauge } from "./hydrometric.js";

const feat = (num, name, lon, lat, disch, level, dt) => ({
  type: "Feature", geometry: { type: "Point", coordinates: [lon, lat] },
  properties: { STATION_NUMBER: num, STATION_NAME: name, DISCHARGE: disch, LEVEL: level, DATETIME: dt },
});
const loc = { lat: 43.78, lon: -80.0 };

describe("buildHydroUrl", () => {
  it("builds a bbox url, latest first, json", () => {
    const u = buildHydroUrl(43.78, -80.0, 0.3);
    expect(u).toContain("hydrometric-realtime/items");
    expect(u).toContain("bbox=-80.3,43.48,-79.7,44.08");
    expect(u).toContain("sortby=-DATETIME");
    expect(u).toContain("f=json");
  });
});

describe("parseGauges", () => {
  it("keeps the latest reading per station and sorts by distance", () => {
    const geojson = { features: [
      feat("A", "Near River", -80.0, 43.79, 1.0, 2.0, "2026-08-07T12:00:00Z"),
      feat("A", "Near River", -80.0, 43.79, 9.9, 2.9, "2026-08-07T12:20:00Z"),
      feat("B", "Far River", -80.4, 44.2, 5.0, 1.0, "2026-08-07T12:20:00Z"),
    ] };
    const g = parseGauges(geojson, loc);
    expect(g).toHaveLength(2);
    expect(g[0].stationNumber).toBe("A");
    expect(g[0].discharge).toBe(9.9);
    expect(g[0].distanceKm).toBeLessThan(g[1].distanceKm);
  });
  it("drops rows with no discharge", () => {
    const geojson = { features: [ feat("C", "No Flow", -80.0, 43.78, null, 2.0, "2026-08-07T12:00:00Z") ] };
    expect(parseGauges(geojson, loc)).toHaveLength(0);
  });
});

describe("nearestGauge", () => {
  it("returns null when the closest gauge is beyond maxKm", () => {
    const geojson = { features: [ feat("D", "Way Off", -83.0, 46.0, 3.0, 1.0, "2026-08-07T12:00:00Z") ] };
    expect(nearestGauge(geojson, loc, 40)).toBe(null);
  });
  it("returns the nearest within range", () => {
    const geojson = { features: [ feat("E", "Close", -80.01, 43.79, 3.0, 1.0, "2026-08-07T12:00:00Z") ] };
    expect(nearestGauge(geojson, loc, 40).stationNumber).toBe("E");
  });
});

describe("stationReading", async () => {
  const { stationReading, STATION } = await import("./hydrometric.js");
  const at = (h) => new Date(Date.UTC(2026, 9, 20, 12) - h * 36e5).toISOString();
  it("returns the latest reading and a rising trend over a day", () => {
    const g = { features: [feat("02HB029", "CREDIT RIVER AT STREETSVILLE", 0, 0, 6, 4.6, at(0)), feat("02HB029", "CREDIT RIVER AT STREETSVILLE", 0, 0, 3.5, 4.4, at(12)), feat("02HB029", "CREDIT RIVER AT STREETSVILLE", 0, 0, 3, 4.4, at(24))] };
    expect(stationReading(g)).toMatchObject({ name: "CREDIT RIVER AT STREETSVILLE", discharge: 6, level: 4.6, discharge24hAgo: 3, trend: "rising" });
  });
  it("calls small changes steady and skips a trend without a day of data", () => {
    const g = { features: [feat("X", "X", 0, 0, 3.1, 1, at(0)), feat("X", "X", 0, 0, 3, 1, at(24))] };
    expect(stationReading(g).trend).toBe("steady");
    expect(stationReading({ features: [feat("X", "X", 0, 0, 3.1, 1, at(0)), feat("X", "X", 0, 0, 9, 1, at(2))] }).trend).toBeNull();
    expect(stationReading({ features: [] })).toBeNull();
  });
  it("only accepts real station numbers", () => {
    expect(STATION.test("02HB029")).toBe(true);
    expect(STATION.test("02HB029&x=1")).toBe(false);
  });
});
