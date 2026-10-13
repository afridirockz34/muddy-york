// Ice fishing, kept honest. We can measure the weather and read the official
// rules; we cannot see the ice. So the app shows three separate things:
//  1. Freeze progress: freezing degree-days (FDD) from real temperatures. More
//     FDD usually means more ice, but currents, springs, snow cover and
//     pressure cracks make ice uneven. It is never a safety rating.
//  2. What's open today, per species, from the Ontario Fishing Regulations
//     Summary (zone seasons plus the lake's own exceptions).
//  3. An outlook for fishing (not for ice): today's weather plus how many of
//     the lake's fish are open. Shown only once the winter has been cold
//     enough for ice fishing to be plausible at all.

export const ICE_SPECIES = [
  { code: "WAL", name: "Walleye", match: /walleye/i },
  { code: "YP", name: "Yellow perch", match: /yellow perch/i },
  { code: "NP", name: "Northern pike", match: /northern pike|^pikes$/i },
  { code: "LAT", name: "Lake trout", match: /lake trout/i },
  { code: "LWF", name: "Lake whitefish", match: /lake whitefish/i },
  { code: "CRP", name: "Crappie", match: /crappie/i },
  { code: "CIS", name: "Lake herring (cisco)", match: /cisco|lake herring/i },
];
// Which of the ice species Ontario's surveys record in this lake.
export function iceSpeciesIn(summary) {
  const parts = String(summary || "").split(",").map((s) => s.trim());
  return ICE_SPECIES.filter((sp) => parts.some((p) => sp.match.test(p))).map((sp) => sp.code);
}
export const iceSpeciesName = (code) => (ICE_SPECIES.find((s) => s.code === code) || {}).name || code;

// Freezing degree-days from daily mean air temperatures (oldest first): the
// sum of degrees below zero, counting from the start of the current cold
// spell's season (the first day it freezes after the last long thaw).
export function freezingDegreeDays(means) {
  const t = (means || []).filter((x) => Number.isFinite(x));
  // A run of 5+ days above +2°C resets the count (ice melts back).
  let start = 0, warmRun = 0;
  t.forEach((v, i) => { if (v > 2) { warmRun++; if (warmRun >= 5) start = i + 1; } else warmRun = 0; });
  let fdd = 0;
  for (let i = start; i < t.length; i++) if (t[i] < 0) fdd += -t[i];
  return Math.round(fdd);
}

// Stage of the winter, from FDD. Words describe weather, never ice safety.
export function freezeStage(fdd) {
  if (fdd < 100) return { stage: "early", label: "Not cold enough yet", note: "Too little freezing weather for ice fishing to be likely. Many lakes will be open or only skimmed." };
  if (fdd < 250) return { stage: "building", label: "Ice building", note: "Freezing weather is adding up. Ice may be forming, unevenly. Wait for operators and local reports." };
  return { stage: "established", label: "Established cold", note: "A long run of freezing weather. Ice is common by now, but it is never uniform. Check it yourself and ask locally." };
}

// Fishing outlook 0-100 for an ice day: weather comfort and open fish. Null
// until the winter is cold enough (stage "early").
export function iceOutlook({ fdd, openCount = 0, presentCount = 0, wind = null, gust = null, air = null, pressureTrend = null }) {
  if (!Number.isFinite(fdd) || fdd < 100) return null;
  const fish = presentCount ? Math.min(1, openCount / Math.min(presentCount, 4)) : 0;
  let comfort = 1;
  const w = Number.isFinite(gust) ? Math.max(wind || 0, gust * 0.7) : wind;
  if (Number.isFinite(w)) comfort -= Math.max(0, Math.min(0.6, (w - 15) / 40));
  if (Number.isFinite(air)) { if (air < -22) comfort -= 0.35; else if (air < -15) comfort -= 0.15; if (air > 3) comfort -= 0.25; }
  const steady = Number.isFinite(pressureTrend) ? (Math.abs(pressureTrend) <= 2 ? 1 : 0.5) : 0.75;
  const score = Math.round(100 * (0.5 * fish + 0.35 * Math.max(0, comfort) + 0.15 * steady));
  return { score, label: score >= 75 ? "Good day" : score >= 55 ? "Fair day" : "Tough day" };
}
