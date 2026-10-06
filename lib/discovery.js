/* Discovery core: Overpass query building + pure normalization. */
const R = 6371;
const toR = (x) => (x * Math.PI) / 180;
function km(a, b, c, d) {
  const dLa = toR(c - a), dLo = toR(d - b);
  const s = Math.sin(dLa / 2) ** 2 + Math.cos(toR(a)) * Math.cos(toR(c)) * Math.sin(dLo / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

// A few shoreline reference points, one per Great Lake, for a coarse "near a
// Great Lake" test. Not a polygon — good enough to flag tributary run water.
const GREAT_LAKE_REFS = [
  [43.62, -79.38], [43.25, -79.80], [43.90, -78.30], // L. Ontario (TO, Hamilton, Cobourg)
  [42.90, -79.90], [42.30, -81.20],                   // L. Erie
  [44.55, -80.45], [44.75, -80.90], [44.35, -79.70], // Georgian Bay / L. Huron
];

export function nearGreatLakeKm(lat, lon) {
  let best = null;
  for (const [la, lo] of GREAT_LAKE_REFS) {
    const d = km(lat, lon, la, lo);
    if (best == null || d < best) best = d;
  }
  return best;
}

// Rivers come back with full geometry (so a long river can give several
// spots), creeks only with a centre point per segment, plus dams/weirs for the
// tailwater test and town names to label each spot. Separate `out` statements
// keep the answer small enough that nothing gets cut off.
export function buildOverpassQuery(lat, lon, radiusM) {
  const a = `around:${radiusM},${lat},${lon}`;
  return `[out:json][timeout:25];` +
    `(way["waterway"="river"]["name"](${a}););out tags geom;` +
    `(way["waterway"="stream"]["name"](${a}););out tags center;` +
    `(node["leisure"="fishing"](${a});node["waterway"~"^(dam|weir)$"](${a}););out;` +
    `node["place"~"^(city|town|village|hamlet|suburb)$"]["name"](${a});out;`;
}

// Lake-side, boating and drainage features aren't river fishing spots.
export const NOT_RIVER = /\b(lake|pond|reservoir|marina|launch|ramp|dock|pier|wharf|harbou?r|bay|beach|slipway|sewer|ditch|drain|diversion|outfall)\b/i;

export const MAX_PER_RIVER = 4, MAX_PER_CREEK = 2, MAX_SPOTS = 150;
// Spots are anchored to a fixed ~3 km grid (not to where the angler stands),
// so scouting again from nearby returns the same spots with the same ids.
const CELL_LAT = 0.03, CELL_LON = 0.04, MIN_GAP_KM = 2.5;
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function pickPoints(points, loc, max, minGapKm = MIN_GAP_KM) {
  const cells = new Map();
  for (const p of points) {
    const ci = Math.floor(p.lat / CELL_LAT), cj = Math.floor(p.lon / CELL_LON);
    const key = `${ci}:${cj}`;
    const cLat = (ci + 0.5) * CELL_LAT, cLon = (cj + 0.5) * CELL_LON;
    const dc = km(p.lat, p.lon, cLat, cLon);
    const cur = cells.get(key);
    if (!cur || dc < cur.dc) cells.set(key, { ...p, key, dc });
  }
  const sorted = [...cells.values()].map((c) => ({ ...c, d: km(loc.lat, loc.lon, c.lat, c.lon) })).sort((x, y) => x.d - y.d);
  const out = [];
  for (const c of sorted) {
    if (out.length >= max) break;
    if (minGapKm > 0 && out.some((o) => km(o.lat, o.lon, c.lat, c.lon) < minGapKm)) continue;
    out.push(c);
  }
  return out;
}

function nearestPlace(places, lat, lon) {
  let best = null;
  for (const pl of places) { const d = km(lat, lon, pl.lat, pl.lon); if (d <= 8 && (!best || d < best.d)) best = { name: pl.name, d }; }
  return best ? best.name : null;
}

// Only rivers, creeks and fishing spots on them. Boat launches and access points
// on lakes (e.g. "Belwood Lake boat launch") are dropped; an unnamed fishing
// access point is kept only when it sits on a named river and takes its name.
export function parseOverpassSpots(json, loc, radiusM = null, { perRiver = MAX_PER_RIVER, perCreek = MAX_PER_CREEK, max = MAX_SPOTS, minGapKm = MIN_GAP_KM } = {}) {
  const els = (json && json.elements) || [];
  const inR = (lat, lon) => !radiusM || km(loc.lat, loc.lon, lat, lon) * 1000 <= radiusM * 1.05;
  const dams = els.filter((e) => e.tags && (e.tags.waterway === "dam" || e.tags.waterway === "weir") && e.lat != null).map((e) => ({ lat: e.lat, lon: e.lon }));
  const isBelowDam = (lat, lon) => dams.some((d) => km(d.lat, d.lon, lat, lon) <= 1.2);
  const places = els.filter((e) => e.type === "node" && e.tags && e.tags.place && e.tags.name && e.lat != null).map((e) => ({ name: e.tags.name, lat: e.lat, lon: e.lon }));

  // Every point we know on each named water, grouped by name.
  const waters = new Map(); // name -> { type, pts:[{lat,lon}] }
  for (const e of els) {
    const t = e.tags || {};
    if ((t.waterway !== "river" && t.waterway !== "stream") || !t.name || NOT_RIVER.test(t.name)) continue;
    const pts = Array.isArray(e.geometry) && e.geometry.length ? e.geometry : (e.center ? [e.center] : []);
    if (!pts.length) continue;
    const w = waters.get(t.name) || { type: t.waterway, pts: [] };
    if (t.waterway === "river") w.type = "river"; // a name mapped as both counts as a river
    for (const p of pts) if (p && p.lat != null) w.pts.push({ lat: p.lat, lon: p.lon });
    waters.set(t.name, w);
  }
  const nearestWater = (lat, lon) => {
    let best = null;
    for (const [name, w] of waters) for (const p of w.pts) { const d = km(lat, lon, p.lat, p.lon); if (!best || d < best.d) best = { name, d, type: w.type }; }
    return best;
  };

  const spots = [];
  for (const e of els) {
    const t = e.tags || {};
    if (t.leisure !== "fishing" || e.lat == null || !inR(e.lat, e.lon)) continue;
    if (t.name && NOT_RIVER.test(t.name)) continue;
    const river = nearestWater(e.lat, e.lon);
    if (!river || river.d > (river.type === "river" ? 0.4 : 0.8)) continue; // not on a river or creek
    const name = t.name || `${river.name} access`;
    // Several mapped access points a few hundred metres apart are one spot.
    if (spots.some((x) => x.kind === "access" && x.name === name && km(x.lat, x.lon, e.lat, e.lon) < 1.5)) continue;
    spots.push({ id: `n${e.id}`, name, river: river.name, lat: e.lat, lon: e.lon,
      waterType: "river", isTailwater: isBelowDam(e.lat, e.lon), kind: "access", near: nearestPlace(places, e.lat, e.lon) });
  }
  for (const [name, w] of waters) {
    const pts = w.pts.filter((p) => inR(p.lat, p.lon));
    if (!pts.length) continue;
    for (const p of pickPoints(pts, loc, w.type === "river" ? perRiver : perCreek, minGapKm)) {
      spots.push({ id: `r:${slug(name)}:${p.key}`, name, lat: p.lat, lon: p.lon, waterType: w.type,
        isTailwater: isBelowDam(p.lat, p.lon), kind: "reach", near: nearestPlace(places, p.lat, p.lon) });
    }
  }
  // Rivers and access points first, then creeks; nearest first within each.
  const rank = (s) => (s.kind === "access" ? 0 : s.waterType === "river" ? 1 : 2);
  spots.sort((x, y) => rank(x) - rank(y) || km(loc.lat, loc.lon, x.lat, x.lon) - km(loc.lat, loc.lon, y.lat, y.lon));
  return spots.slice(0, max);
}

// ── Shared tiles ──
// The backend scouts fixed 0.25° tiles once and stores every candidate spot in
// each (one per ~3 km grid cell per water). A scout then merges the tiles
// around the angler and picks from them, so results are instant, identical for
// everyone in the same place, and Overpass is asked once per tile, not per user.
export const TILE = 0.25;
export const tileOf = (lat, lon) => ({ i: Math.floor(lat / TILE), j: Math.floor(lon / TILE) });
export function tileBox({ i, j }, pad = 0.02) {
  return { s: i * TILE - pad, w: j * TILE - pad, n: (i + 1) * TILE + pad, e: (j + 1) * TILE + pad };
}
export function buildTileQuery(t) {
  const { s, w, n, e } = tileBox(t);
  const b = `${s.toFixed(3)},${w.toFixed(3)},${n.toFixed(3)},${e.toFixed(3)}`;
  return `[out:json][timeout:25];` +
    `(way["waterway"="river"]["name"](${b}););out tags geom;` +
    `(way["waterway"="stream"]["name"](${b}););out tags center;` +
    `(node["leisure"="fishing"](${b});node["waterway"~"^(dam|weir)$"](${b}););out;` +
    `node["place"~"^(city|town|village|hamlet|suburb)$"]["name"](${b});out;`;
}
// Every candidate spot inside one tile (no per-river cap, no spacing).
export function tileCandidates(json, t) {
  const { s, w, n, e } = tileBox(t, 0);
  const centre = { lat: (s + n) / 2, lon: (w + e) / 2 };
  return parseOverpassSpots(json, centre, null, { perRiver: Infinity, perCreek: Infinity, max: Infinity, minGapKm: 0 })
    .filter((x) => x.lat >= s && x.lat < n && x.lon >= w && x.lon < e)
    .map((x) => ({ id: x.id, name: x.name, ...(x.river ? { river: x.river } : {}), lat: +x.lat.toFixed(5), lon: +x.lon.toFixed(5),
      waterType: x.waterType, isTailwater: x.isTailwater, kind: x.kind, ...(x.near ? { near: x.near } : {}) }));
}
// Tiles touching a search circle, nearest first.
export function tilesFor(loc, radiusM) {
  const dLat = radiusM / 111320, dLon = radiusM / (111320 * Math.cos((loc.lat * Math.PI) / 180));
  const a = tileOf(loc.lat - dLat, loc.lon - dLon), b = tileOf(loc.lat + dLat, loc.lon + dLon);
  const out = [];
  for (let i = a.i; i <= b.i; i++) for (let j = a.j; j <= b.j; j++) {
    const { s, w, n, e } = tileBox({ i, j }, 0);
    const cLat = Math.min(Math.max(loc.lat, s), n), cLon = Math.min(Math.max(loc.lon, w), e);
    const d = km(loc.lat, loc.lon, cLat, cLon);
    if (d * 1000 <= radiusM) out.push({ i, j, d });
  }
  return out.sort((x, y) => x.d - y.d);
}
// Pick the scout's spots from merged tile candidates: within the radius, up to
// MAX_PER_RIVER / MAX_PER_CREEK spaced spots per water, access points merged,
// rivers and access first, nearest first, MAX_SPOTS in all.
export function selectSpots(candidates, loc, radiusM) {
  const seen = new Set(), inR = [];
  for (const c of candidates) {
    if (seen.has(c.id)) continue; seen.add(c.id);
    if (km(loc.lat, loc.lon, c.lat, c.lon) * 1000 <= radiusM) inR.push(c);
  }
  const out = [];
  const access = inR.filter((c) => c.kind === "access").sort((x, y) => km(loc.lat, loc.lon, x.lat, x.lon) - km(loc.lat, loc.lon, y.lat, y.lon));
  for (const a of access) if (!out.some((x) => x.name === a.name && km(x.lat, x.lon, a.lat, a.lon) < 1.5)) out.push(a);
  const byName = new Map();
  for (const c of inR) if (c.kind === "reach") { const l = byName.get(c.name) || []; l.push(c); byName.set(c.name, l); }
  for (const [, list] of byName) {
    const max = list.some((c) => c.waterType === "river") ? MAX_PER_RIVER : MAX_PER_CREEK;
    for (const p of pickPoints(list, loc, max)) { const { key, dc, d, ...spot } = p; out.push(spot); }
  }
  const rank = (s) => (s.kind === "access" ? 0 : s.waterType === "river" ? 1 : 2);
  out.sort((x, y) => rank(x) - rank(y) || km(loc.lat, loc.lon, x.lat, x.lon) - km(loc.lat, loc.lon, y.lat, y.lon));
  return out.slice(0, MAX_SPOTS);
}

// For scout results saved by older versions: keep only river spots.
export function isRiverSpot(sec) {
  return !!sec && sec.section !== "Boat launch" && sec.river !== "Fishing access" && !NOT_RIVER.test(sec.river || "");
}
