// Turn Water Survey of Canada realtime gauge series into flow-trend news for the
// app's rivers. For each station we compare the earliest and latest discharge in
// the window; stations whose name matches a covered river become a "flow rising /
// dropping" item (one per river, the biggest mover). Pure and testable.
function matcherFor(river) {
  // Use the distinctive part of the name (drop a trailing River/Creek) as a
  // whole-word, whitespace-flexible matcher.
  const core = river.replace(/\s+(River|Creek)$/i, "").replace(/[^a-z0-9 ]/gi, "").trim().replace(/\s+/g, "\\s+");
  return new RegExp("\\b" + core + "\\b", "i");
}

export function flowNews(geojson, { rivers = [], minPct = 15, limit = 5 } = {}) {
  const feats = (geojson && geojson.features) || [];
  const byStation = new Map();
  for (const f of feats) {
    const p = (f && f.properties) || {};
    if (p.DISCHARGE == null || !p.STATION_NUMBER) continue;
    const s = byStation.get(p.STATION_NUMBER) || { name: p.STATION_NAME || p.STATION_NUMBER, series: [] };
    s.series.push([p.DATETIME, p.DISCHARGE]);
    byStation.set(p.STATION_NUMBER, s);
  }
  const matchers = rivers.map((r) => ({ river: r, re: matcherFor(r) }));
  const perRiver = new Map();
  for (const s of byStation.values()) {
    if (s.series.length < 2) continue;
    s.series.sort((a, b) => new Date(a[0]) - new Date(b[0]));
    const a = s.series[0][1], b = s.series[s.series.length - 1][1];
    if (!(a > 0)) continue;
    const pct = Math.round(((b - a) / a) * 100);
    if (Math.abs(pct) < minPct) continue;
    const m = matchers.find((x) => x.re.test(s.name));
    if (!m) continue;
    const prev = perRiver.get(m.river);
    if (!prev || Math.abs(pct) > Math.abs(prev.pct)) {
      perRiver.set(m.river, { river: m.river, station: s.name, discharge: Math.round(b * 10) / 10, pct });
    }
  }
  return [...perRiver.values()].sort((x, y) => Math.abs(y.pct) - Math.abs(x.pct)).slice(0, limit);
}
