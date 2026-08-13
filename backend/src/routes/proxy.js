import { makeCache } from "../proxy/cache.js";
import { resilientFetch } from "../proxy/resilient-fetch.js";
import { OVERPASS_HOSTS, OSRM_BASE } from "../proxy/hosts.js";
import { buildDiscoverQuery, buildParkingQuery } from "../proxy/overpass.js";
import { buildHydroUrl, nearestGauge } from "../proxy/hydrometric.js";
import { buildBathyUrl, parseBathy } from "../../../lib/bathymetry.js";
import { parseStocking } from "../../../lib/stocking.js";
import { stockingNews } from "../../../lib/stocking-news.js";
import { flowNews } from "../../../lib/flow-news.js";

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
        { retries: 1, timeoutMs: 12000 });
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

    app.get("/api/bathymetry", async (req, reply) => {
      const lat = num(req.query.lat), lon = num(req.query.lon);
      if (lat === null || lon === null) return reply.code(400).send({ error: "lat and lon required" });
      const key = `bathy:${r3(lat)},${r3(lon)}`;
      const hit = cache.get(key); if (hit) return hit;
      let json;
      try { const res = await proxyFetch([buildBathyUrl(lat, lon)], {}, { retries: 1 }); json = await res.json(); }
      catch { return reply.code(502).send({ error: "bathymetry unavailable" }); }
      const payload = { bathy: parseBathy(json) };
      cache.set(key, payload, 30 * 24 * 3600 * 1000);
      return payload;
    });

    const STOCKING_URL = "https://services1.arcgis.com/TJH5KDher0W13Kgo/arcgis/rest/services/FishStockingDataForRecreationalPurposes/FeatureServer/0";
    app.get("/api/stocking", async (req, reply) => {
      const lat = num(req.query.lat), lon = num(req.query.lon);
      if (lat === null || lon === null) return reply.code(400).send({ error: "lat and lon required" });
      if (!STOCKING_URL) return { stocking: null };
      const key = `stock:${r3(lat)},${r3(lon)}`;
      const hit = cache.get(key); if (hit) return hit;
      const h = 0.25;
      const url = `${STOCKING_URL}/query?geometry=${(lon - h).toFixed(3)},${(lat - h).toFixed(3)},${(lon + h).toFixed(3)},${(lat + h).toFixed(3)}` +
        `&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=false&f=json&resultRecordCount=200`;
      let json;
      try { const res = await proxyFetch([url], {}, { retries: 1 }); json = await res.json(); }
      catch { return reply.code(502).send({ error: "stocking unavailable" }); }
      const payload = { stocking: parseStocking(json, { lat, lon }) };
      cache.set(key, payload, 7 * 24 * 3600 * 1000);
      return payload;
    });

    // Region-wide recent stocking events as feed news (real, official data).
    app.get("/api/stocking-news", async (req, reply) => {
      const key = "stocknews:v1";
      const hit = cache.get(key); if (hit) return hit;
      const minYear = new Date().getFullYear() - 1; // this year + last
      const params = new URLSearchParams({
        where: `Stocking_Year>=${minYear}`,
        geometry: "-81.7,43.0,-78.2,44.8", // Southern Ontario coverage box
        geometryType: "esriGeometryEnvelope", inSR: "4326",
        spatialRel: "esriSpatialRelIntersects",
        outFields: "Stocking_Year,Species,Official_Waterbody_Name,Unoffcial_Waterbody_Name,Number_of_Fish_Stocked",
        returnGeometry: "false", orderByFields: "Stocking_Year DESC",
        f: "json", resultRecordCount: "400",
      });
      let json;
      try { const res = await proxyFetch([`${STOCKING_URL}/query?${params}`], {}, { retries: 1, timeoutMs: 12000 }); json = await res.json(); }
      catch { return reply.code(502).send({ error: "stocking unavailable" }); }
      const payload = { items: stockingNews(json, { minYear, limit: 6 }) };
      cache.set(key, payload, 24 * 3600 * 1000);
      return payload;
    });

    // Live flow-trend news from Water Survey of Canada realtime gauges.
    const FLOW_RIVERS = [
      "Grand River", "Credit River", "Ganaraska River", "Nottawasaga River", "Beaver River",
      "Twelve Mile Creek", "Bronte Creek", "Sixteen Mile Creek", "Duffins Creek", "Wilmot Creek",
      "Niagara River", "Saugeen River", "Maitland River", "Boyne River", "Humber River",
      "Conestogo River", "Bighead River", "Sydenham River", "Rouge River", "Bowmanville Creek",
      "Sauble River",
    ];
    app.get("/api/flow-news", async (req, reply) => {
      const key = "flownews:v1";
      const hit = cache.get(key); if (hit) return hit;
      const end = new Date(), start = new Date(end.getTime() - 30 * 3600 * 1000);
      const iso = (d) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
      const params = new URLSearchParams({
        bbox: "-81.7,43.0,-78.2,44.8",
        datetime: `${iso(start)}/${iso(end)}`,
        properties: "STATION_NUMBER,STATION_NAME,DISCHARGE,DATETIME",
        limit: "10000", sortby: "DATETIME", f: "json",
      });
      let json;
      try { const res = await proxyFetch([`https://api.weather.gc.ca/collections/hydrometric-realtime/items?${params}`], {}, { retries: 1, timeoutMs: 15000 }); json = await res.json(); }
      catch { return reply.code(502).send({ error: "flow data unavailable" }); }
      const payload = { items: flowNews(json, { rivers: FLOW_RIVERS, minPct: 12, limit: 5 }) };
      cache.set(key, payload, 90 * 60 * 1000);
      return payload;
    });
  };
}
