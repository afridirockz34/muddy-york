// Cold-water index, 0 to 100: how well a stretch stays cold enough for trout.
// Built from Ontario's official thermal classification of the stream segment
// (Aquatic Resource Area data: Cold / Cool / Warm), our habitat model's cold
// score, and what members measure on the water. Higher is colder.
const BASE = { cold: 88, cool: 64, warm: 28 };

export function coldWaterIndex({ thermal = null, habitatCold = null, memberTemps = [], month = new Date().getMonth() } = {}) {
  const t = thermal ? String(thermal).toLowerCase() : null;
  const official = BASE[t] ?? null;
  const model = Number.isFinite(habitatCold) ? habitatCold : null;
  let idx;
  if (official != null && model != null) idx = 0.7 * official + 0.3 * model;
  else if (official != null) idx = official;
  else if (model != null) idx = model;
  else return null;
  // Summer readings from members say the most about cold water.
  const summer = month >= 5 && month <= 8;
  const temps = memberTemps.filter((x) => Number.isFinite(x));
  if (summer && temps.length) {
    const avg = temps.reduce((a, b) => a + b, 0) / temps.length;
    if (avg <= 16) idx += 8; else if (avg >= 22) idx -= 15; else if (avg >= 20) idx -= 8;
  }
  idx = Math.max(0, Math.min(100, Math.round(idx)));
  return { index: idx, label: idx >= 75 ? "Cold water" : idx >= 55 ? "Cool water" : "Warm in summer",
    source: official != null ? "official" : "model" };
}

// Trout and salmon in an Ontario survey species list, as the app's codes.
// Rainbow trout near a Great Lake are counted as steelhead.
const SPECIES_CODE = [[/brook trout/i, "BKT"], [/brown trout/i, "BNT"], [/chinook/i, "CHN"], [/coho/i, "COH"], [/atlantic salmon/i, "ATS"], [/lake trout/i, "LAT"]];
export function surveyedTroutSalmon(summary, { nearGreatLakeKm = 999 } = {}) {
  const txt = String(summary || "");
  const out = [];
  for (const [re, code] of SPECIES_CODE) if (re.test(txt)) out.push(code);
  if (/rainbow trout|steelhead/i.test(txt)) out.push(nearGreatLakeKm < 40 ? "STL" : "RBT");
  return out;
}
