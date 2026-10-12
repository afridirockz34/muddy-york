import { prisma } from "../db.js";
import { getCurrentUser } from "../auth/current-user.js";
import { isAdmin } from "../social/moderation.js";
import { entitlementForUser } from "../billing/user-entitlement.js";
import { USER_AGENT } from "../proxy/resilient-fetch.js";
import { RUN_SPOTS, RUN_STATES, isRunSpot, runSummary } from "../../../lib/run-spots.js";
import { scoreAccuracy } from "../../../lib/score-accuracy.js";

// Members' own data: trip reports (blank days included), the next-morning
// "how did it go?" prompt, run sightings, and the official stream data
// (thermal class and surveyed species) behind the cold-water index.
// Privacy: we store the river, never a location; public numbers are river
// totals, held back two days, and only shown once a river has 3+ reports.

const DAY = 864e5;
export const torontoDay = (d = new Date()) => new Date(d).toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
const dayDate = (key) => new Date(`${key}T12:00:00Z`);
const shiftDay = (key, n) => torontoDay(new Date(dayDate(key).getTime() + n * DAY));
const str = (v, n) => String(v ?? "").trim().slice(0, n);
const MIN_PUBLIC = 3;

const ARA_LAYER = "https://ws.lioservices.lrc.gov.on.ca/arcgis2/rest/services/LIO_OPEN_DATA/LIO_Open07/MapServer/1/query";
// Nearest official stream segment to a point: its thermal class and the
// species recorded in Ontario's surveys. Prefers a segment with the same name.
async function araQuery(lat, lon, distanceM, fetchImpl) {
  const q = new URLSearchParams({ geometry: `${lon},${lat}`, geometryType: "esriGeometryPoint", inSR: "4326", distance: String(distanceM), units: "esriSRUnit_Meter",
    spatialRel: "esriSpatialRelIntersects", outFields: "OFFICIAL_WATERBODY_NAME,THERMAL_REGIME,FISH_SPECIES_SUMMARY", returnGeometry: "false", f: "json" });
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 8000);
  try {
    const res = await fetchImpl(`${ARA_LAYER}?${q}`, { headers: { "User-Agent": USER_AGENT }, signal: ctl.signal });
    if (!res.ok) return null;
    return ((await res.json())?.features || []).map((f) => f.attributes || {});
  } finally { clearTimeout(t); }
}
export async function araAt(lat, lon, name, fetchImpl = fetch) {
  // Spot coordinates can sit a little off the mapped river line: look close
  // first, then a bit wider.
  let feats = await araQuery(lat, lon, 300, fetchImpl);
  if (feats && !feats.length) feats = await araQuery(lat, lon, 1200, fetchImpl);
  if (feats == null) return null;
  {
    if (!feats.length) return { thermal: null, species: "", name: null, empty: true };
    // Only trust segments of this water: ones carrying its name, or unnamed
    // pieces (much of a river's main stem is unnamed in the data). A different
    // creek's segment nearby must not lend its class or species.
    const want = String(name || "").toLowerCase().replace(/\s+(river|creek|brook)$/, "").trim();
    const nm = (a) => String(a.OFFICIAL_WATERBODY_NAME || "").toLowerCase();
    const named = want ? feats.filter((a) => nm(a).includes(want)) : [];
    const pool = named.length ? named : want ? feats.filter((a) => !nm(a)) : feats;
    if (!pool.length) return { thermal: null, species: "", name: null, empty: true };
    const known = pool.find((a) => a.THERMAL_REGIME && a.THERMAL_REGIME !== "Unknown");
    const a = named[0] || known || pool[0];
    const thermal = known ? known.THERMAL_REGIME : null;
    const species = [...new Set(pool.flatMap((x) => String(x.FISH_SPECIES_SUMMARY || "").split(",")).map((s) => s.trim()).filter(Boolean))].join(",");
    return { thermal, species, name: a.OFFICIAL_WATERBODY_NAME || null };
  }
}

export default async function fieldReportRoutes(app, opts = {}) {
  const fetchImpl = opts.fetchImpl || fetch;
  const auth = async (req, reply) => {
    const u = await getCurrentUser(req);
    if (!u) { reply.code(401).send({ error: "sign in first" }); return; }
    req.user = u;
  };
  const member = async (req, reply) => {
    const u = await getCurrentUser(req);
    if (!u) { reply.code(401).send({ error: "sign in first" }); return; }
    const ent = await entitlementForUser(u.id);
    if (ent !== "active" && ent !== "trialing") { reply.code(402).send({ error: "members only" }); return; }
    req.user = u;
  };

  // ── trip intents: a Directions tap means "probably fishing today" ──
  app.post("/trip-intents", { preHandler: auth }, async (req, reply) => {
    const b = req.body || {};
    const ref = str(b.ref, 120);
    if (!ref) return reply.code(400).send({ error: "ref required" });
    const dayKey = torontoDay();
    const score = Number.isFinite(+b.score) ? Math.round(+b.score) : null;
    const it = await prisma.tripIntent.upsert({
      where: { userId_ref_dayKey: { userId: req.user.id, ref, dayKey } },
      create: { userId: req.user.id, ref, river: str(b.river, 120), section: str(b.section, 160), score, dayKey },
      update: score != null ? { score } : {},
    });
    return { intent: { id: it.id, dayKey } };
  });

  // Unanswered trips from the last three days, newest first.
  app.get("/trip-intents/pending", { preHandler: auth }, async (req) => {
    const today = torontoDay();
    const rows = await prisma.tripIntent.findMany({
      where: { userId: req.user.id, doneAt: null, dayKey: { lt: today, gte: shiftDay(today, -3) } },
      orderBy: { createdAt: "desc" }, take: 3,
    });
    return { pending: rows.map((r) => ({ id: r.id, ref: r.ref, river: r.river, section: r.section, dayKey: r.dayKey, score: r.score })) };
  });

  app.post("/trip-intents/:id/dismiss", { preHandler: auth }, async (req) => {
    await prisma.tripIntent.updateMany({ where: { id: req.params.id, userId: req.user.id }, data: { doneAt: new Date() } });
    return { ok: true };
  });

  // ── trip reports ──
  app.post("/trip-reports", { preHandler: auth }, async (req, reply) => {
    const b = req.body || {};
    const ref = str(b.ref, 120);
    if (!ref) return reply.code(400).send({ error: "ref required" });
    const today = torontoDay();
    const dayKey = /^\d{4}-\d{2}-\d{2}$/.test(b.dayKey || "") ? b.dayKey : today;
    if (dayKey > today || dayKey < shiftDay(today, -14)) return reply.code(400).send({ error: "trip date must be within the last two weeks" });
    const fished = b.fished !== false;
    const caught = fished ? Math.max(0, Math.min(50, Math.round(+b.caught || 0))) : 0;
    const species = Array.isArray(b.species) ? b.species.map((x) => str(x, 12)).filter(Boolean).slice(0, 8) : [];
    const temp = b.waterTempC === "" || b.waterTempC == null ? null : +b.waterTempC;
    const waterTempC = Number.isFinite(temp) && temp > -2 && temp < 35 ? Math.round(temp * 10) / 10 : null;
    const intent = await prisma.tripIntent.findFirst({ where: { userId: req.user.id, ref, dayKey } });
    const scoreAtTrip = Number.isFinite(+b.scoreAtTrip) && b.scoreAtTrip !== null ? Math.round(+b.scoreAtTrip) : intent?.score ?? null;
    const data = { river: str(b.river, 120) || intent?.river || "", section: str(b.section, 160) || intent?.section || "",
      fished, caught, species, waterTempC, note: str(b.note, 500) || null, scoreAtTrip };
    const r = await prisma.tripReport.upsert({
      where: { userId_ref_tripDate: { userId: req.user.id, ref, tripDate: dayDate(dayKey) } },
      create: { userId: req.user.id, ref, tripDate: dayDate(dayKey), ...data }, update: data,
    });
    await prisma.tripIntent.updateMany({ where: { userId: req.user.id, ref, dayKey, doneAt: null }, data: { doneAt: new Date() } });
    return { report: { id: r.id, dayKey, fished: r.fished, caught: r.caught } };
  });

  app.get("/trip-reports", { preHandler: auth }, async (req) => {
    const rows = await prisma.tripReport.findMany({ where: { userId: req.user.id }, orderBy: { tripDate: "desc" }, take: 100 });
    return { reports: rows.map((r) => ({ id: r.id, ref: r.ref, river: r.river, section: r.section, dayKey: torontoDay(r.tripDate),
      fished: r.fished, caught: r.caught, species: r.species, waterTempC: r.waterTempC, note: r.note })) };
  });

  // River totals from the last 30 days, held back two days. Rivers with fewer
  // than 3 reports are left out so nobody's trip can be singled out.
  app.get("/api/river-reports", async (req, reply) => {
    const now = Date.now();
    const rows = await prisma.tripReport.findMany({
      where: { tripDate: { gte: new Date(now - 32 * DAY), lte: new Date(now - 2 * DAY) } },
      select: { ref: true, fished: true, caught: true, waterTempC: true },
    });
    const by = {};
    for (const r of rows) {
      if (!r.fished) continue;
      const x = (by[r.ref] ||= { trips: 0, withFish: 0, temps: [] });
      x.trips++; if (r.caught > 0) x.withFish++;
      if (r.waterTempC != null && x.temps.length < 20) x.temps.push(r.waterTempC);
    }
    for (const k of Object.keys(by)) if (by[k].trips < MIN_PUBLIC) delete by[k];
    reply.header("Cache-Control", "public, max-age=1800");
    return { byRef: by, days: 30 };
  });

  app.get("/api/score-accuracy", async (req, reply) => {
    const rows = await prisma.tripReport.findMany({ select: { fished: true, caught: true, scoreAtTrip: true } });
    reply.header("Cache-Control", "public, max-age=3600");
    return scoreAccuracy(rows);
  });

  // ── run tracker ──
  const spotStatus = async (spot, now = Date.now()) => {
    const [note, rows] = await Promise.all([
      prisma.runNote.findUnique({ where: { spot } }),
      prisma.runCheckin.findMany({ where: { spot, createdAt: { gte: new Date(now - 7 * DAY) } }, select: { status: true, createdAt: true } }),
    ]);
    return { spot, note: note?.note || null, noteUpdatedAt: note?.updatedAt || null, ...runSummary(rows, now) };
  };
  app.get("/api/run-status", async (req, reply) => {
    const spot = str(req.query?.spot, 80);
    reply.header("Cache-Control", "public, max-age=600");
    if (spot) {
      if (!isRunSpot(spot)) return reply.code(404).send({ error: "unknown run spot" });
      return spotStatus(spot);
    }
    return { spots: await Promise.all(RUN_SPOTS.map((s) => spotStatus(s.slug))) };
  });

  // Members: the day-by-day picture for the last two weeks.
  app.get("/api/run-status/:spot/timeline", { preHandler: member }, async (req, reply) => {
    const spot = req.params.spot;
    if (!isRunSpot(spot)) return reply.code(404).send({ error: "unknown run spot" });
    const since = new Date(Date.now() - 14 * DAY);
    const rows = await prisma.runCheckin.findMany({ where: { spot, createdAt: { gte: since } }, select: { status: true, createdAt: true } });
    const days = {};
    for (const r of rows) { const k = torontoDay(r.createdAt); (days[k] ||= {})[r.status] = ((days[k] || {})[r.status] || 0) + 1; }
    return { spot, days: Object.entries(days).sort(([a], [b]) => (a < b ? 1 : -1)).map(([day, counts]) => ({ day, counts })) };
  });

  // Members report what they saw. One sighting per spot every 6 hours; a new
  // one within that window replaces the last.
  app.post("/run-checkins", { preHandler: member }, async (req, reply) => {
    const b = req.body || {};
    const spot = str(b.spot, 80), status = str(b.status, 12);
    if (!isRunSpot(spot) || !RUN_STATES.includes(status)) return reply.code(400).send({ error: "spot and status required" });
    const recent = await prisma.runCheckin.findFirst({ where: { userId: req.user.id, spot, createdAt: { gte: new Date(Date.now() - 6 * 3600e3) } } });
    if (recent) await prisma.runCheckin.update({ where: { id: recent.id }, data: { status, createdAt: new Date() } });
    else await prisma.runCheckin.create({ data: { userId: req.user.id, spot, status } });
    return spotStatus(spot);
  });

  app.put("/api/admin/run-notes/:spot", async (req, reply) => {
    const u = await getCurrentUser(req);
    if (!u || !isAdmin(u)) return reply.code(403).send({ error: "admins only" });
    const spot = req.params.spot;
    if (!isRunSpot(spot)) return reply.code(404).send({ error: "unknown run spot" });
    const note = str(req.body?.note, 220);
    if (!note) { await prisma.runNote.deleteMany({ where: { spot } }); return { spot, note: null }; }
    const r = await prisma.runNote.upsert({ where: { spot }, create: { spot, note }, update: { note } });
    return { spot, note: r.note, noteUpdatedAt: r.updatedAt };
  });

  // ── official stream data for the cold-water index ──
  // { points: [{ lat, lon, name }] } -> [{ thermal, species, name } | null].
  // Cached per ~100 m cell for 180 days; points not fetched within the time
  // budget come back null and are filled on a later request.
  app.post("/api/stream-info", async (req) => {
    const pts = Array.isArray(req.body?.points) ? req.body.points.slice(0, 200) : [];
    const t0 = Date.now();
    const keyOf = (p) => { const lat = +p?.lat, lon = +p?.lon;
      return Number.isFinite(lat) && Number.isFinite(lon) && lat >= 41 && lat <= 57 && lon >= -96 && lon <= -74 ? `ara:${lat.toFixed(3)},${lon.toFixed(3)}` : null; };
    const keys = pts.map(keyOf);
    const uniq = [...new Set(keys.filter(Boolean))];
    const rows = await prisma.mapDataCache.findMany({ where: { key: { in: uniq } } }).catch(() => []);
    // Found data keeps for 180 days; "nothing mapped here" is re-checked weekly.
    const fresh = (r) => Date.now() - new Date(r.fetchedAt).getTime() < (r.data && r.data.empty ? 7 : 180) * DAY;
    const got = new Map(rows.filter(fresh).map((r) => [r.key, r.data]));
    // Fetch the rest six at a time, within an 18 second budget.
    const todo = uniq.filter((k) => !got.has(k));
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(6, todo.length) }, async () => {
      while (next < todo.length && Date.now() - t0 < 18000) {
        const k = todo[next++]; const i = keys.indexOf(k); const p = pts[i];
        let v = null;
        try { v = await araAt(+p.lat, +p.lon, p.name, fetchImpl); } catch { v = null; }
        if (v) { got.set(k, v); await prisma.mapDataCache.upsert({ where: { key: k }, create: { key: k, data: v, fetchedAt: new Date() }, update: { data: v, fetchedAt: new Date() } }).catch(() => {}); }
      }
    }));
    const out = keys.map((k) => (k && got.has(k) ? got.get(k) : null));
    return { points: out };
  });
}
