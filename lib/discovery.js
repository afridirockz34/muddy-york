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

export function buildOverpassQuery(lat, lon, radiusM) {
  const a = `around:${radiusM},${lat},${lon}`;
  return `[out:json][timeout:25];(` +
    `node["leisure"="fishing"](${a});` +
    `node["leisure"="slipway"](${a});` +
    `node["waterway"="dam"](${a});node["waterway"="weir"](${a});` +
    `way["waterway"="river"]["name"](${a});` +
    `way["waterway"="stream"]["name"](${a});` +
    `);out tags geom center 200;`;
}

function reachRepPoint(geom, loc) {
  let best = null;
  for (const p of geom) {
    const d = km(loc.lat, loc.lon, p.lat, p.lon);
    if (!best || d < best.d) best = { lat: p.lat, lon: p.lon, d };
  }
  return best;
}

export function parseOverpassSpots(json, loc) {
  const els = (json && json.elements) || [];
  const dams = els
    .filter((e) => e.tags && (e.tags.waterway === "dam" || e.tags.waterway === "weir") && e.lat != null)
    .map((e) => ({ lat: e.lat, lon: e.lon }));
  const isBelowDam = (lat, lon) => dams.some((d) => km(d.lat, d.lon, lat, lon) <= 1.2);

  const spots = [];
  for (const e of els) {
    const t = e.tags || {};
    if (t.leisure === "fishing" && e.lat != null) {
      spots.push({ id: `n${e.id}`, name: t.name || "Fishing access", lat: e.lat, lon: e.lon,
        waterType: "river", isTailwater: isBelowDam(e.lat, e.lon), kind: "access" });
    } else if (t.leisure === "slipway" && e.lat != null) {
      spots.push({ id: `n${e.id}`, name: t.name || "Boat launch", lat: e.lat, lon: e.lon,
        waterType: "lake", isTailwater: false, kind: "slipway" });
    } else if ((t.waterway === "river" || t.waterway === "stream") && t.name && Array.isArray(e.geometry)) {
      const rep = reachRepPoint(e.geometry, loc);
      if (!rep) continue;
      spots.push({ id: `w${e.id}`, name: t.name, lat: rep.lat, lon: rep.lon,
        waterType: t.waterway, isTailwater: isBelowDam(rep.lat, rep.lon), kind: "reach" });
    }
  }
  // dedupe reaches sharing a name to the nearest representative point
  const byName = new Map();
  const out = [];
  for (const s of spots) {
    if (s.kind !== "reach") { out.push(s); continue; }
    const cur = byName.get(s.name);
    const d = km(loc.lat, loc.lon, s.lat, s.lon);
    if (!cur || d < cur.d) byName.set(s.name, { spot: s, d });
  }
  for (const { spot } of byName.values()) out.push(spot);
  return out;
}
