import { makeCache } from "../proxy/cache.js";
import { resilientFetch } from "../proxy/resilient-fetch.js";
import { OVERPASS_HOSTS, OSRM_BASE } from "../proxy/hosts.js";
import { buildDiscoverQuery, buildParkingQuery } from "../proxy/overpass.js";
import { buildHydroUrl, nearestGauge } from "../proxy/hydrometric.js";

const DAY = 864e5;
const num = (v) => (v === undefined || v === "" || isNaN(Number(v)) ? null : Number(v));
const r3 = (n) => Math.round(n * 1000) / 1000;

export default function proxyRoutes(proxyFetch = resilientFetch) {
  const cache = makeCache();

  async function overpass(query, key, ttl, reply) {
    const hit = cache.get(key);
    if (hit) return hit;
    let json;
    try {
      const res = await proxyFetch(OVERPASS_HOSTS,
        { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "data=" + encodeURIComponent(query) },
        { retries: 1 });
      json = await res.json();
    } catch { reply.code(502).send({ error: "upstream unavailable" }); return null; }
    cache.set(key, json, ttl);
    return json;
  }

  return async function (app) {
    app.get("/api/discover", async (req, reply) => {
      const lat = num(req.query.lat), lon = num(req.query.lon), radiusM = num(req.query.radiusM) || 30000;
      if (lat === null || lon === null) return reply.code(400).send({ error: "lat and lon required" });
      const key = `disc:${r3(lat)},${r3(lon)}:${radiusM}`;
      const json = await overpass(buildDiscoverQuery(lat, lon, radiusM), key, 7 * DAY, reply);
      if (json) return json;
    });

    app.get("/api/parking", async (req, reply) => {
      const lat = num(req.query.lat), lon = num(req.query.lon);
      if (lat === null || lon === null) return reply.code(400).send({ error: "lat and lon required" });
      const key = `park:${r3(lat)},${r3(lon)}`;
      const json = await overpass(buildParkingQuery(lat, lon), key, 7 * DAY, reply);
      if (json) return json;
    });

    app.get("/api/route", async (req, reply) => {
      const profile = req.query.profile === "foot" ? "foot" : req.query.profile === "driving" ? "driving" : null;
      if (!profile) return reply.code(400).send({ error: "profile must be driving or foot" });
      const from = String(req.query.from || ""), to = String(req.query.to || "");
      if (!/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(from) || !/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(to))
        return reply.code(400).send({ error: "from/to must be lon,lat" });
      const key = `route:${profile}:${from};${to}`;
      const hit = cache.get(key);
      if (hit) return hit;
      let json;
      try {
        const url = `${OSRM_BASE}/route/v1/${profile}/${from};${to}?overview=full&geometries=geojson`;
        const res = await proxyFetch([url], {}, { retries: 1 });
        json = await res.json();
      } catch { return reply.code(502).send({ error: "routing unavailable" }); }
      cache.set(key, json, DAY);
      return json;
    });

    app.get("/api/conditions", async (req, reply) => {
      const lat = num(req.query.lat), lon = num(req.query.lon);
      if (lat === null || lon === null) return reply.code(400).send({ error: "lat and lon required" });
      const key = `cond:${r3(lat)},${r3(lon)}`;
      const hit = cache.get(key);
      if (hit) return hit;
      let geojson;
      try {
        const res = await proxyFetch([buildHydroUrl(lat, lon)], {}, { retries: 1 });
        geojson = await res.json();
      } catch { return reply.code(502).send({ error: "gauge data unavailable" }); }
      const payload = { gauge: nearestGauge(geojson, { lat, lon }) };
      cache.set(key, payload, 60 * 60 * 1000);
      return payload;
    });
  };
}
