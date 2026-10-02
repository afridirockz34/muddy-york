import { describe, it, expect, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/db.js";

function stub(json) {
  return vi.fn().mockResolvedValue(new Response(JSON.stringify(json), { status: 200 }));
}

describe("bathymetry route", () => {
  it("400 on bad coords", async () => {
    const app = buildApp({ proxyFetch: stub({ features: [] }) });
    expect((await app.inject({ method: "GET", url: "/api/bathymetry?lat=x&lon=-80" })).statusCode).toBe(400);
  });
  it("returns max depth + caches", async () => {
    const f = stub({ features: [{ attributes: { DEPTH: -12 } }, { attributes: { DEPTH: -3 } }] });
    const app = buildApp({ proxyFetch: f });
    const url = "/api/bathymetry?lat=44.4&lon=-79.5";
    const a = await app.inject({ method: "GET", url });
    expect(a.json().bathy.maxDepthM).toBe(12);
    await app.inject({ method: "GET", url });
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe("conditions route", () => {
  const feat = (num, lon, lat, disch, dt) => ({
    geometry: { type: "Point", coordinates: [lon, lat] },
    properties: { STATION_NUMBER: num, STATION_NAME: num, DISCHARGE: disch, LEVEL: 1, DATETIME: dt },
  });

  it("400s on bad coords", async () => {
    const app = buildApp({ proxyFetch: stub({ features: [] }) });
    const res = await app.inject({ method: "GET", url: "/api/conditions?lat=x&lon=-80" });
    expect(res.statusCode).toBe(400);
  });

  it("returns the nearest gauge and caches", async () => {
    const f = stub({ features: [ feat("Z", -80.01, 43.79, 4.2, "2026-08-07T12:00:00Z") ] });
    const app = buildApp({ proxyFetch: f });
    const url = "/api/conditions?lat=43.78&lon=-80.0";
    const a = await app.inject({ method: "GET", url });
    expect(a.statusCode).toBe(200);
    expect(a.json().gauge.stationNumber).toBe("Z");
    expect(a.json().gauge.discharge).toBe(4.2);
    await app.inject({ method: "GET", url });
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe("proxy routes", () => {
  it("400s on bad coordinates", async () => {
    const app = buildApp({ proxyFetch: stub({ elements: [] }) });
    const res = await app.inject({ method: "GET", url: "/api/discover?lat=abc&lon=-80&radiusM=30000" });
    expect(res.statusCode).toBe(400);
  });

  it("discover returns upstream elements and caches (second call: no refetch)", async () => {
    const f = stub({ elements: [{ id: 1 }] });
    const app = buildApp({ proxyFetch: f });
    const url = "/api/discover?lat=43.7&lon=-80.3&radiusM=30000";
    const a = await app.inject({ method: "GET", url });
    expect(a.statusCode).toBe(200);
    expect(a.json().elements).toEqual([{ id: 1 }]);
    const b = await app.inject({ method: "GET", url });
    expect(b.json().elements).toEqual([{ id: 1 }]);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("route validates profile and proxies OSRM", async () => {
    const f = stub({ code: "Ok", routes: [{ distance: 100, duration: 60, geometry: { coordinates: [] } }] });
    const app = buildApp({ proxyFetch: f });
    const ok = await app.inject({ method: "GET", url: "/api/route?profile=foot&from=-80.3,43.7&to=-80.31,43.71" });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().code).toBe("Ok");
    const bad = await app.inject({ method: "GET", url: "/api/route?profile=jetpack&from=-80.3,43.7&to=-80.31,43.71" });
    expect(bad.statusCode).toBe(400);
  });
});

describe("discover route (Overpass) cache", () => {
  const url = "/api/discover?lat=43.61&lon=-79.71&radiusM=30000";
  const body = { elements: [{ type: "way", id: 1, tags: { waterway: "river", name: "Credit River" }, geometry: [{ lat: 43.6, lon: -79.7 }] }] };

  it("stores the answer and serves it when Overpass is down", async () => {
    await prisma.mapDataCache.deleteMany();
    const ok = await buildApp({ proxyFetch: stub(body) }).inject({ method: "GET", url });
    expect(ok.json().elements).toHaveLength(1);
    await new Promise((r) => setTimeout(r, 50)); // the store is written in the background
    await prisma.mapDataCache.updateMany({ data: { fetchedAt: new Date(0) } }); // make it stale
    const down = vi.fn().mockRejectedValue(new Error("504"));
    const res = await buildApp({ proxyFetch: down }).inject({ method: "GET", url });
    expect(res.statusCode).toBe(200);
    expect(res.json().elements[0].tags.name).toBe("Credit River");
    expect(down).toHaveBeenCalledTimes(1);
  });
  it("serves a fresh stored answer without asking Overpass", async () => {
    const f = stub(body);
    await buildApp({ proxyFetch: stub(body) }).inject({ method: "GET", url: "/api/discover?lat=44.0&lon=-80.0&radiusM=30000" });
    await new Promise((r) => setTimeout(r, 50));
    await buildApp({ proxyFetch: f }).inject({ method: "GET", url: "/api/discover?lat=44.001&lon=-80.001&radiusM=30000" });
    expect(f).not.toHaveBeenCalled(); // same ~2 km cell, stored copy is fresh
  });
  it("502s only when there is no copy at all", async () => {
    await prisma.mapDataCache.deleteMany();
    const res = await buildApp({ proxyFetch: vi.fn().mockRejectedValue(new Error("down")) }).inject({ method: "GET", url: "/api/discover?lat=45&lon=-78&radiusM=30000" });
    expect(res.statusCode).toBe(502);
  });
});
