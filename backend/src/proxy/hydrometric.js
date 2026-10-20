const R = 6371, toR = (x) => (x * Math.PI) / 180;
function km(a, b, c, d) {
  const dLa = toR(c - a), dLo = toR(d - b);
  const s = Math.sin(dLa / 2) ** 2 + Math.cos(toR(a)) * Math.cos(toR(c)) * Math.sin(dLo / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}
const f4 = (n) => Math.round(n * 100) / 100;

export function buildHydroUrl(lat, lon, halfDeg = 0.3) {
  const bbox = `${f4(lon - halfDeg)},${f4(lat - halfDeg)},${f4(lon + halfDeg)},${f4(lat + halfDeg)}`;
  return `https://api.weather.gc.ca/collections/hydrometric-realtime/items?bbox=${bbox}&sortby=-DATETIME&limit=200&f=json`;
}

export function parseGauges(geojson, loc) {
  const feats = (geojson && geojson.features) || [];
  const byStation = new Map();
  for (const f of feats) {
    const p = f.properties || {}, coords = (f.geometry && f.geometry.coordinates) || [];
    const lon = coords[0], lat = coords[1];
    if (lat == null || p.DISCHARGE == null) continue;
    const cur = byStation.get(p.STATION_NUMBER);
    if (!cur || new Date(p.DATETIME).getTime() > new Date(cur.observedAt).getTime()) {
      byStation.set(p.STATION_NUMBER, {
        stationNumber: p.STATION_NUMBER,
        name: p.STATION_NAME || p.STATION_NUMBER,
        lat, lon,
        discharge: p.DISCHARGE,
        level: p.LEVEL != null ? p.LEVEL : null,
        observedAt: p.DATETIME,
      });
    }
  }
  return [...byStation.values()]
    .map((s) => ({ ...s, distanceKm: +km(loc.lat, loc.lon, s.lat, s.lon).toFixed(1) }))
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

export function nearestGauge(geojson, loc, maxKm = 40) {
  const list = parseGauges(geojson, loc);
  return list.length && list[0].distanceKm <= maxKm ? list[0] : null;
}

// One station's latest reading plus how the flow changed over about a day,
// for the public river pages (each page names the gauge on its own river).
export const STATION = /^0[0-9][A-Z]{2}[0-9]{3}$/;
export function buildStationUrl(station) {
  return `https://api.weather.gc.ca/collections/hydrometric-realtime/items?STATION_NUMBER=${station}&sortby=-DATETIME&limit=320&f=json`;
}
export function stationReading(geojson) {
  const rows = ((geojson && geojson.features) || []).map((f) => f.properties || {}).filter((p) => p.DATETIME && (p.DISCHARGE != null || p.LEVEL != null));
  if (!rows.length) return null;
  rows.sort((a, b) => new Date(b.DATETIME) - new Date(a.DATETIME));
  const now = rows[0], t0 = new Date(now.DATETIME).getTime();
  const dayAgo = rows.reduce((best, p) => (Math.abs(t0 - 864e5 - new Date(p.DATETIME)) < Math.abs(t0 - 864e5 - new Date(best.DATETIME)) ? p : best), rows[rows.length - 1]);
  const hoursBack = (t0 - new Date(dayAgo.DATETIME)) / 36e5;
  let trend = null;
  if (hoursBack >= 12 && now.DISCHARGE != null && dayAgo.DISCHARGE != null && dayAgo.DISCHARGE > 0) {
    const ch = (now.DISCHARGE - dayAgo.DISCHARGE) / dayAgo.DISCHARGE;
    trend = ch > 0.15 ? "rising" : ch < -0.15 ? "falling" : "steady";
  }
  return { stationNumber: now.STATION_NUMBER, name: now.STATION_NAME || now.STATION_NUMBER, discharge: now.DISCHARGE ?? null,
    level: now.LEVEL ?? null, observedAt: now.DATETIME, discharge24hAgo: dayAgo.DISCHARGE ?? null, trend };
}
