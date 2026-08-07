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
