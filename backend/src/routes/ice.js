import { prisma } from "../db.js";
import { getCurrentUser } from "../auth/current-user.js";
import { isAdmin } from "../social/moderation.js";
import { resilientFetch, USER_AGENT } from "../proxy/resilient-fetch.js";
import { OVERPASS_HOSTS } from "../proxy/hosts.js";
import { currentZones } from "../regs/sync.js";
import { fmzAt } from "./regulations.js";
import { lakeBundle } from "../../../lib/regs-status.js";
import { ICE_LAKES } from "../../../lib/ice-lakes.js";
import { iceSpeciesIn, ICE_SPECIES } from "../../../lib/ice.js";
import { OFFICIAL_SPECIES } from "../../../lib/regs-reaches.js";

// Seasonal ice fishing. Off until the admin turns the season on (or
// ICE_SEASON=on for testing). Lakes: the curated list plus named lakes near
// the angler from OpenStreetMap, each with its official zone, Ontario's lake
// record (species, depth) and the rules that name the lake.
const DAY = 864e5;
const ARA_POLY = "https://ws.lioservices.lrc.gov.on.ca/arcgis2/rest/services/LIO_OPEN_DATA/LIO_Open07/MapServer/2/query";
const km = (a, b, c, d) => { const R = 6371, t = (x) => (x * Math.PI) / 180; const s = Math.sin(t(c - a) / 2) ** 2 + Math.cos(t(a)) * Math.cos(t(c)) * Math.sin(t(d - b) / 2) ** 2; return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)); };

export async function iceSeasonOn() {
  if (process.env.ICE_SEASON === "on") return true;
  const row = await prisma.setting.findUnique({ where: { key: "iceSeason" } }).catch(() => null);
  return !!(row && row.value === true);
}

async function cached(key, ttl, fn) {
  const hit = await prisma.mapDataCache.findUnique({ where: { key } }).catch(() => null);
  if (hit && Date.now() - new Date(hit.fetchedAt).getTime() < ttl) return hit.data;
  let v = null;
  try { v = await fn(); } catch { v = null; }
  if (v != null) await prisma.mapDataCache.upsert({ where: { key }, create: { key, data: v, fetchedAt: new Date() }, update: { data: v, fetchedAt: new Date() } }).catch(() => {});
  return v ?? (hit ? hit.data : null);
}

// Ontario's lake record near a point, preferring the same name.
async function lakeRecord(lat, lon, name, fetchImpl) {
  const q = new URLSearchParams({ geometry: `${lon},${lat}`, geometryType: "esriGeometryPoint", inSR: "4326", distance: "1500", units: "esriSRUnit_Meter",
    spatialRel: "esriSpatialRelIntersects", outFields: "OFFICIAL_WATERBODY_NAME,THERMAL_REGIME,FISH_SPECIES_SUMMARY,MAXIMUM_DEPTH,MEAN_DEPTH", returnGeometry: "false", f: "json" });
  const res = await fetchImpl(`${ARA_POLY}?${q}`, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) return null;
  const feats = ((await res.json())?.features || []).map((f) => f.attributes || {});
  const want = String(name || "").toLowerCase();
  const a = feats.find((x) => String(x.OFFICIAL_WATERBODY_NAME || "").toLowerCase() === want) || feats.find((x) => x.FISH_SPECIES_SUMMARY) || null;
  if (!a) return { empty: true };
  return { name: a.OFFICIAL_WATERBODY_NAME || null, thermal: a.THERMAL_REGIME || null, species: a.FISH_SPECIES_SUMMARY || "",
    maxDepth: a.MAXIMUM_DEPTH ? +a.MAXIMUM_DEPTH : null, meanDepth: a.MEAN_DEPTH ? +a.MEAN_DEPTH : null };
}

// Named lakes and reservoirs around a point, at least ~1.2 km across.
async function nearbyLakes(lat, lon, radiusM, fetchImpl) {
  const a = `around:${radiusM},${lat},${lon}`;
  const query = `[out:json][timeout:25];(way["natural"="water"]["water"~"^(lake|reservoir)$"]["name"](${a});relation["natural"="water"]["water"~"^(lake|reservoir)$"]["name"](${a}););out tags center bb;`;
  const res = await fetchImpl(OVERPASS_HOSTS, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "data=" + encodeURIComponent(query) }, { retries: 0, timeoutMs: 25000 });
  const els = (await res.json())?.elements || [];
  const out = [];
  for (const e of els) {
    const b = e.bounds, c = e.center; if (!b || !c || !e.tags?.name) continue;
    if (km(b.minlat, b.minlon, b.maxlat, b.maxlon) < 1.2) continue;
    out.push({ id: `osm-${e.type[0]}${e.id}`, name: e.tags.name, lat: +c.lat.toFixed(5), lon: +c.lon.toFixed(5) });
  }
  return out;
}

export default async function iceRoutes(app, opts = {}) {
  const fetchImpl = opts.fetchImpl || fetch;
  const overpassFetch = opts.overpassFetch || resilientFetch;

  app.get("/api/season", async (req, reply) => {
    reply.header("Cache-Control", "public, max-age=300");
    return { ice: await iceSeasonOn() };
  });
  app.put("/api/admin/season", async (req, reply) => {
    const u = await getCurrentUser(req);
    if (!u || !isAdmin(u)) return reply.code(403).send({ error: "admins only" });
    const ice = req.body?.ice === true;
    await prisma.setting.upsert({ where: { key: "iceSeason" }, create: { key: "iceSeason", value: ice }, update: { value: ice } });
    return { ice };
  });

  // Ice lakes near a point (or all curated lakes when no point is given).
  app.get("/api/ice/lakes", async (req, reply) => {
    const lat = Number(req.query?.lat), lon = Number(req.query?.lon);
    const radiusM = Math.min(Math.max(Number(req.query?.radiusM) || 60000, 5000), 160000);
    const here = Number.isFinite(lat) && Number.isFinite(lon);
    let list = ICE_LAKES.map((l) => ({ ...l, curated: true }));
    if (here) {
      list = list.filter((l) => km(lat, lon, l.lat, l.lon) * 1000 <= radiusM + 20000);
      const cell = `${(Math.round(lat * 10) / 10).toFixed(1)},${(Math.round(lon * 10) / 10).toFixed(1)}`;
      const found = await cached(`icelakes:${cell}:${radiusM}`, 30 * DAY, () => nearbyLakes(lat, lon, radiusM, overpassFetch)) || [];
      const names = new Set(list.map((l) => l.name.toLowerCase()));
      for (const f of found) if (!names.has(f.name.toLowerCase())) { names.add(f.name.toLowerCase()); list.push({ ...f, curated: false }); }
      list = list.map((l) => ({ ...l, distKm: Math.round(km(lat, lon, l.lat, l.lon)) })).sort((a, b) => (b.curated - a.curated) || a.distKm - b.distKm).slice(0, 30);
    }
    const { zones } = await currentZones();
    const out = [];
    for (const l of list) {
      const zone = await cached(`fmz:${l.lat.toFixed(2)},${l.lon.toFixed(2)}`, 3650 * DAY, async () => { const z = await fmzAt(l.lat, l.lon); return z == null ? null : { zone: z }; });
      const rec = await cached(`aralake:${l.lat.toFixed(3)},${l.lon.toFixed(3)}`, 180 * DAY, () => lakeRecord(l.lat, l.lon, l.araName || l.name, fetchImpl));
      const z = zone && zone.zone;
      const bundle = z ? lakeBundle(z, l.name, zones) : null;
      if (bundle) for (const k of Object.keys(bundle.zoneWide)) if (!ICE_SPECIES.some((s) => OFFICIAL_SPECIES[s.code] === k)) delete bundle.zoneWide[k];
      out.push({ id: l.id, name: l.name, lat: l.lat, lon: l.lon, distKm: l.distKm ?? null, curated: !!l.curated, page: l.page || null, areas: l.areas || [],
        zone: z || null, species: l.species || (rec && !rec.empty ? iceSpeciesIn(rec.species) : []), maxDepth: l.araName ? null : rec?.maxDepth ?? null,
        meanDepth: l.araName ? null : rec?.meanDepth ?? null, bundle });
    }
    reply.header("Cache-Control", "public, max-age=1800");
    return { lakes: out };
  });
}
