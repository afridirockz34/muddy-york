import { prisma } from "../db.js";
import { getCurrentUser } from "../auth/current-user.js";
import { isAdmin } from "../social/moderation.js";
import { REACH_REGS } from "../../../lib/regs-reaches.js";
import { resolveReach, statusFor, zoneBundle } from "../../../lib/regs-status.js";
import { REGS_BASE, textFragmentUrl, zoneCorpus } from "../../../lib/regs-parse.js";
import { currentZones, syncAll, unmatchedMappings, ZONES } from "../regs/sync.js";
import { USER_AGENT } from "../proxy/resilient-fetch.js";

const FMZ_LAYER = "https://ws.lioservices.lrc.gov.on.ca/arcgis2/rest/services/LIO_OPEN_DATA/LIO_Open07/MapServer/14/query";
export async function fmzAt(lat, lon, fetchImpl = fetch) {
  const q = new URLSearchParams({ geometry: `${lon},${lat}`, geometryType: "esriGeometryPoint", inSR: "4326",
    spatialRel: "esriSpatialRelIntersects", outFields: "FISHERIES_MANAGEMENT_ZONE_ID", returnGeometry: "false", f: "json" });
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 8000);
  try {
    const res = await fetchImpl(`${FMZ_LAYER}?${q}`, { headers: { "User-Agent": USER_AGENT }, signal: ctl.signal });
    if (!res.ok) return null;
    const d = await res.json();
    const z = d?.features?.[0]?.attributes?.FISHERIES_MANAGEMENT_ZONE_ID;
    return Number.isInteger(z) && z >= 1 && z <= 20 ? z : null;
  } finally { clearTimeout(t); }
}

// Official Ontario regulations, synced from ontario.ca (see src/regs/sync.js).
export default async function regulationsRoutes(app) {
  // Per-section bundles of the official entries (verbatim text + deep links);
  // the app computes today's status from these.
  app.get("/api/regs/reaches", async (req, reply) => {
    const { zones, rows } = await currentZones();
    if (!rows.length) return reply.code(503).send({ error: "regulations not loaded yet" });
    const reaches = {};
    for (const id of Object.keys(REACH_REGS)) { const b = resolveReach(id, zones); if (b) reaches[id] = b; }
    const used = new Set(Object.values(REACH_REGS).map((r) => r.zone));
    const relevant = rows.filter((r) => used.has(r.zone));
    reply.header("Cache-Control", "public, max-age=900");
    return {
      source: REGS_BASE,
      checkedAt: oldest(relevant.map((r) => r.checkedAt)),
      changedAt: newest(relevant.map((r) => r.fetchedAt)),
      reaches,
    };
  });

  // Today's official status for one section, for the public river pages:
  // /api/regs/status?id=credit-lower&sp=STL,CHN
  app.get("/api/regs/status", async (req, reply) => {
    const id = String(req.query?.id || "");
    if (!REACH_REGS[id]) return reply.code(404).send({ error: "unknown section" });
    const sp = String(req.query?.sp || "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 8);
    const { zones, rows } = await currentZones();
    const b = resolveReach(id, zones);
    const s = b && statusFor(b, sp.length ? sp : speciesHint(), new Date());
    if (!s) return reply.code(503).send({ error: "regulations not loaded yet" });
    reply.header("Cache-Control", "public, max-age=900");
    return {
      state: s.state, label: s.label, tone: s.tone, zone: s.zone,
      stretches: s.stretches.map((st) => ({ label: st.label, state: st.state, stateLabel: st.stateLabel })),
      checkedAt: oldest(rows.filter((r) => r.zone === b.zone).map((r) => r.checkedAt)),
    };
  });

  // Which fisheries management zone a point is in, from Ontario's official FMZ
  // boundaries (Land Information Ontario). For scouted spots with no entry of
  // their own, so the app can still show the zone, its zone-wide seasons and a
  // link to its rules. Cached per ~1 km cell; zone lines don't move.
  const inOntario = (lat, lon) => Number.isFinite(lat) && Number.isFinite(lon) && lat >= 41 && lat <= 57 && lon >= -96 && lon <= -74;
  async function zoneForPoint(lat, lon) {
    const key = `fmz:${lat.toFixed(2)},${lon.toFixed(2)}`;
    try { const hit = await prisma.mapDataCache.findUnique({ where: { key } }); if (hit && hit.data?.zone != null) return hit.data.zone; } catch {}
    let zone = null;
    try { zone = await fmzAt(lat, lon); } catch { zone = null; }
    if (zone != null) {
      await prisma.mapDataCache.upsert({ where: { key }, create: { key, data: { zone }, fetchedAt: new Date() },
        update: { data: { zone }, fetchedAt: new Date() } }).catch(() => {});
    }
    return zone;
  }
  const zoneInfo = (zone, zones) => {
    const z = zones[zone];
    return { zone, url: z?.url || `${REGS_BASE}/fisheries-management-zone-${zone}`, page: `/regulations/zone-${zone}/`, bundle: z ? zoneBundle(zone, zones) : null };
  };
  // How many official entries in this zone name the water. If any do, the
  // zone-wide season may not be the one that applies, so the app says "Check".
  const namedIn = (parsed, name) => {
    if (!parsed || !name || name.length < 3) return 0;
    const re = new RegExp(`(^|[^a-z])${name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z])`);
    let n = 0; const hit = (t) => re.test(String(t).toLowerCase());
    parsed.speciesExceptions.forEach((g) => g.waters.forEach((w) => { if (hit(w.text)) n++; }));
    parsed.waterbody.forEach((e) => { if (hit(e.text)) n++; });
    parsed.sanctuaries.forEach((x) => x.waters.forEach((w) => { if (hit(w.text)) n++; }));
    return n;
  };

  app.get("/api/regs/zone-at", async (req, reply) => {
    const lat = Number(req.query?.lat), lon = Number(req.query?.lon);
    if (!inOntario(lat, lon)) return reply.code(400).send({ error: "lat/lon in Ontario required" });
    const zone = await zoneForPoint(lat, lon);
    if (zone == null) return reply.code(503).send({ error: "zone lookup unavailable" });
    const { zones } = await currentZones();
    const { bundle, ...info } = zoneInfo(zone, zones);
    const seasons = bundle ? Object.entries(bundle.zoneWide).filter(([sp, v]) => v.season && /trout|salmon/i.test(sp)).map(([species, v]) => ({ species, season: v.season, limits: v.limits })) : [];
    reply.header("Cache-Control", "public, max-age=86400");
    return { ...info, seasons };
  });

  // Batch form for a whole scout: { points: [{ lat, lon, name }] } →
  // { zones: { "16": { url, page, bundle } }, points: [{ zone, named }] }.
  app.post("/api/regs/zones-at", async (req, reply) => {
    const pts = Array.isArray(req.body?.points) ? req.body.points.slice(0, 200) : [];
    const { zones } = await currentZones();
    const cells = new Map();
    const out = [];
    for (const p of pts) {
      const lat = Number(p?.lat), lon = Number(p?.lon);
      if (!inOntario(lat, lon)) { out.push({ zone: null, named: 0 }); continue; }
      const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
      if (!cells.has(key)) cells.set(key, zoneForPoint(lat, lon));
      const zone = await cells.get(key);
      out.push({ zone, named: zone != null ? namedIn(zones[zone], String(p?.name || "").trim()) : 0 });
    }
    const used = {};
    for (const z of new Set(out.map((o) => o.zone).filter((z) => z != null))) used[z] = zoneInfo(z, zones);
    return { zones: used, points: out };
  });

  // Official entries naming a water, across every zone — for spots the app
  // discovers on the fly (not in the curated list).
  app.get("/api/regs/lookup", async (req, reply) => {
    const name = String(req.query?.name || "").trim();
    if (name.length < 3) return reply.code(400).send({ error: "name required" });
    // Whole-name match ("Humber River" must not pick up "Humberstone Lake").
    const re = new RegExp(`(^|[^a-z])${name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z])`);
    const { zones } = await currentZones();
    const hits = [];
    const push = (zone, kind, text, extra) => hits.push({ zone, kind, text, link: textFragmentUrl(zones[zone].url, text, zoneCorpus(zones[zone])), ...extra });
    for (const [z, p] of Object.entries(zones)) {
      const hit = (t) => re.test(t.toLowerCase());
      p.speciesExceptions.forEach((g) => g.waters.forEach((w) => { if (hit(w.text)) push(z, "spx", w.text, { species: g.species, season: g.season || null }); }));
      p.waterbody.forEach((e) => { if (hit(e.text)) push(z, "wb", e.text, { rules: e.rules }); });
      p.sanctuaries.forEach((s) => s.waters.forEach((w) => { if (!w.seeExceptions && hit(w.text)) push(z, "sanct", w.text, { period: s.period }); }));
    }
    reply.header("Cache-Control", "public, max-age=900");
    return { name, entries: hits.slice(0, 40) };
  });

  // Legacy shape for app versions still in the wild: one state per section,
  // now computed from the official data instead of the old hand-written file.
  app.get("/api/regulations", async () => {
    const { zones, rows } = await currentZones();
    if (!rows.length) return {};
    const reaches = {};
    const now = new Date();
    for (const id of Object.keys(REACH_REGS)) {
      const b = resolveReach(id, zones);
      const s = b && statusFor(b, speciesHint(), now);
      if (!s) continue;
      const state = s.state === "open" || s.state === "closed" ? s.state : "check";
      reaches[id] = { state, detail: s.stretches.map((st) => `${st.label}: ${st.stateLabel}`).join(" · ") + " — see the official entries for this water." };
    }
    return { version: "official-sync", regsUrl: REGS_BASE, updatedAt: oldest(rows.map((r) => r.checkedAt)), reaches };
  });

  // Admin: sync health, recent changes, and sections needing review.
  app.get("/api/admin/regs", async (req, reply) => {
    if (!isAdmin(await getCurrentUser(req))) return reply.code(403).send({ error: "forbidden" });
    const { zones, rows } = await currentZones();
    const changes = await prisma.regsChange.findMany({ orderBy: { detectedAt: "desc" }, take: 20 });
    return {
      zones: ZONES.map((z) => { const r = rows.find((x) => x.zone === z);
        return r ? { zone: z, url: r.url, checkedAt: r.checkedAt, changedAt: r.fetchedAt, lastError: r.lastError, failedAt: r.failedAt } : { zone: z, missing: true }; }),
      changes,
      unmatched: unmatchedMappings(zones),
    };
  });
  app.post("/api/admin/regs/sync", async (req, reply) => {
    if (!isAdmin(await getCurrentUser(req))) return reply.code(403).send({ error: "forbidden" });
    const r = await syncAll({ notify: true });
    return { checked: r.checked, changed: r.changed.map((c) => ({ zone: c.zone, added: c.added.length, removed: c.removed.length })), failed: r.failed, unmatched: r.unmatched };
  });
}

// The legacy endpoint has no species list, so judge by the species the
// section's stretches are about: trout and salmon.
const speciesHint = () => ["STL", "BNT", "BKT", "CHN", "ATS"];
const oldest = (ds) => (ds.length ? new Date(Math.min(...ds.map((d) => +new Date(d)))).toISOString() : null);
const newest = (ds) => (ds.length ? new Date(Math.max(...ds.map((d) => +new Date(d)))).toISOString() : null);
