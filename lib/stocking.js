const R = 6371, toR = (x) => (x * Math.PI) / 180;
function km(a, b, c, d) {
  const dLa = toR(c - a), dLo = toR(d - b);
  const s = Math.sin(dLa / 2) ** 2 + Math.cos(toR(a)) * Math.cos(toR(c)) * Math.sin(dLo / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}
const pick = (a, keys) => { for (const k of keys) if (a[k] != null) return a[k]; return null; };

export function parseStocking(json, loc, nowYear = new Date().getFullYear()) {
  const feats = (json && json.features) || [];
  const events = feats.map((f) => {
    const a = f.attributes || {}, g = f.geometry || {};
    // Prefer the explicit WGS84 attributes (avoids geometry SR ambiguity), else geometry.
    const lat = pick(a, ["Latitude", "LATITUDE", "lat"]) ?? g.y;
    const lon = pick(a, ["Longitude", "LONGITUDE", "lon"]) ?? g.x;
    if (lat == null || lon == null) return null;
    let yr = pick(a, ["Stocking_Year", "STOCK_YEAR", "YEAR", "SPAWN_YEAR", "STOCKING_YEAR"]);
    if (yr && yr > 1e9) yr = new Date(yr).getFullYear();
    return {
      species: pick(a, ["Species", "SPECIES", "COMMON_NAME", "FISH_SPECIES"]) || "Unknown",
      stage: pick(a, ["Developmental_Stage", "DEVELOPMENT_STAGE", "STAGE", "LIFE_STAGE"]) || "",
      year: yr ? +yr : null,
      yearsAgo: yr ? nowYear - +yr : null,
      distanceKm: +km(loc.lat, loc.lon, lat, lon).toFixed(1),
    };
  }).filter(Boolean).sort((a, b) => a.distanceKm - b.distanceKm);
  if (!events.length) return null;
  return { events: events.slice(0, 10), nearestKm: events[0].distanceKm };
}
