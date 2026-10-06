import { makeCache } from "../proxy/cache.js";
import { prisma } from "../db.js";
import { resilientFetch } from "../proxy/resilient-fetch.js";
import { OVERPASS_HOSTS, OSRM_BASE } from "../proxy/hosts.js";
import { buildDiscoverQuery, buildParkingQuery } from "../proxy/overpass.js";
import { discoverSpots } from "../discovery/tiles.js";
import { buildHydroUrl, nearestGauge } from "../proxy/hydrometric.js";
import { buildBathyUrl, parseBathy } from "../../../lib/bathymetry.js";
import { parseStocking } from "../../../lib/stocking.js";
import { stockingNews } from "../../../lib/stocking-news.js";
import { flowNews } from "../../../lib/flow-news.js";

const DAY = 864e5;

// Discovery answers can be over a megabyte, almost all of it river outlines.
// Keep one outline point every ~250 m (plenty to place spots and match access
// points) and only the tags the app reads, before caching or sending to phones.
const KEEP_TAGS = ["name", "waterway", "leisure", "place"];
export function compactDiscover(json) {
  const near = (a, b) => Math.abs(a.lat - b.lat) < 0.00225 && Math.abs(a.lon - b.lon) < 0.003;
  const elements = (json.elements || []).map((e) => {
    const tags = {}; for (const k of KEEP_TAGS) if (e.tags && e.tags[k] != null) tags[k] = e.tags[k];
    const o = { type: e.type, id: e.id, tags };
    if (e.lat != null) { o.lat = +e.lat.toFixed(5); o.lon = +e.lon.toFixed(5); }
    if (e.center) o.center = { lat: +e.center.lat.toFixed(5), lon: +e.center.lon.toFixed(5) };
    if (Array.isArray(e.geometry)) {
      const g = []; for (const p of e.geometry) { if (!p) continue; if (!g.length || !near(g[g.length - 1], p)) g.push({ lat: +p.lat.toFixed(5), lon: +p.lon.toFixed(5) }); }
      const last = e.geometry[e.geometry.length - 1]; if (last && g.length && g[g.length - 1] !== last) g.push({ lat: +last.lat.toFixed(5), lon: +last.lon.toFixed(5) });
      o.geometry = g;
    }
    return o;
  });
  return { elements };
}
const num = (v) => (v === undefined || v === "" || isNaN(Number(v)) ? null : Number(v));
const r3 = (n) => Math.round(n * 1000) / 1000;

export default function proxyRoutes(proxyFetch = resilientFetch) {
  const cache = makeCache();

  // Overpass is a free public service and often overloaded. Answers are kept in
  // memory and in Postgres: a fresh stored copy is served without asking
  // Overpass at all, and a stale one is served when Overpass fails (rivers and
  // parking lots barely change). Only with no copy at all does the app see 502.
  async function overpass(query, key, ttl, reply, { shape = (j) => j, timeoutMs = 20000 } = {}) {
    const hit = cache.get(key);
    if (hit) return hit;
    const stored = await prisma.mapDataCache.findUnique({ where: { key } }).catch(() => null);
    if (stored && Date.now() - new Date(stored.fetchedAt).getTime() < ttl) { cache.set(key, stored.data, ttl); return stored.data; }
    let json;
    try {
      const res = await proxyFetch(OVERPASS_HOSTS,
        { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "data=" + encodeURIComponent(query) },
        { retries: 0, timeoutMs }); // each server once; a busy one can take ~20 s
      json = await res.json();
      if (!json || !Array.isArray(json.elements)) throw new Error("bad overpass payload");
      json = shape(json);
    } catch {
      if (stored) { cache.set(key, stored.data, 60 * 60 * 1000); return stored.data; }
      reply.code(502).send({ error: "upstream unavailable" }); return null;
    }
    cache.set(key, json, ttl);
    prisma.mapDataCache.upsert({ where: { key }, create: { key, data: json, fetchedAt: new Date() }, update: { data: json, fetchedAt: new Date() } }).catch(() => {});
    return json;
  }

  return async function (app) {
    app.get("/api/discover", async (req, reply) => {
      const lat = num(req.query.lat), lon = num(req.query.lon), radiusM = num(req.query.radiusM) || 30000;
      if (lat === null || lon === null) return reply.code(400).send({ error: "lat and lon required" });
      // Snap the search centre to a ~2 km grid so nearby anglers share one answer.
      const clat = Math.round(lat * 50) / 50, clon = Math.round(lon * 50) / 50;
      const key = `disc2:${clat},${clon}:${radiusM}`; // v2: no element cap, creek centres, town names
      const json = await overpass(buildDiscoverQuery(clat, clon, radiusM), key, 14 * DAY, reply, { shape: compactDiscover, timeoutMs: 32000 });
      if (json) return json;
    });

    // Ready-made scout: spots from the shared tiles (src/discovery/tiles.js).
    app.get("/api/discover-spots", async (req, reply) => {
      const lat = num(req.query.lat), lon = num(req.query.lon);
      const radiusM = Math.min(Math.max(num(req.query.radiusM) || 30000, 1000), 160000);
      if (lat === null || lon === null) return reply.code(400).send({ error: "lat and lon required" });
      const r = await discoverSpots({ lat, lon }, radiusM, { fetchImpl: proxyFetch });
      if (!r.spots.length && r.partial) return reply.code(502).send({ error: "upstream unavailable" });
      reply.header("Cache-Control", r.partial ? "no-store" : "public, max-age=3600");
      return r;
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
