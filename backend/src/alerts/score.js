// Bounded port of the frontend scoring (source-app.jsx) — enough to judge a
// prime-conditions alert. Color/UI-free. Keep the numbers in sync with the app.
export const SPECIES_ACT = {
  STL: { mode: "run", a: [0.50,0.55,0.85,1.00,0.55,0.10,0.05,0.05,0.35,0.70,0.85,0.60] },
  CHN: { mode: "run", a: [0,0,0,0,0,0,0.05,0.55,1.00,0.70,0.15,0] },
  COH: { mode: "run", a: [0,0,0,0,0,0,0,0.10,0.30,0.90,0.70,0.10] },
  BNTr:{ mode: "run", a: [0.15,0.15,0.20,0.25,0.15,0.05,0.05,0.10,0.40,0.90,0.80,0.30] },
  BNT: { mode: "resident", a: [0.40,0.40,0.60,0.80,0.90,0.85,0.70,0.65,0.85,0.90,0.60,0.45] },
  RBT: { mode: "resident", a: [0.30,0.30,0.55,0.80,0.85,0.75,0.60,0.55,0.80,0.85,0.55,0.35] },
  BKT: { mode: "resident", a: [0.10,0.10,0.10,0.70,0.95,0.90,0.75,0.70,0.85,0.15,0.10,0.10] },
  ATS: { mode: "run", a: [0.05,0.05,0.05,0.05,0.20,0.40,0.50,0.55,0.60,0.40,0.10,0.05] },
  LAT: { mode: "resident", a: [0.70,0.65,0.70,0.60,0.30,0.15,0.10,0.10,0.25,0.55,0.75,0.75] },
  SMB: { mode: "resident", a: [0.05,0.05,0.10,0.35,0.75,0.95,0.90,0.85,0.75,0.55,0.20,0.08] },
  NP:  { mode: "resident", a: [0.35,0.35,0.55,0.85,0.80,0.60,0.50,0.50,0.65,0.80,0.70,0.45] },
  WAL: { mode: "resident", a: [0.30,0.30,0.55,0.80,0.70,0.60,0.55,0.55,0.70,0.80,0.60,0.40] },
  PAN: { mode: "resident", a: [0.15,0.15,0.30,0.60,0.85,0.95,0.90,0.85,0.75,0.55,0.30,0.18] },
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const clamp100 = (v) => clamp(v, 0, 100);

export function modelStreamTemp(cold, airMean) {
  const gwBase = 8 + (1 - cold / 100) * 4.5;
  const track = 0.34 + 0.56 * (1 - cold / 100);
  return Math.max(2, Math.min(27, gwBase + track * (airMean - gwBase)));
}
function habitatComposite(h) {
  return Math.round(0.26*h.cold + 0.22*h.hold + 0.16*h.struct + 0.14*h.ox + 0.12*h.spawn + 0.10*h.gw);
}
function bestSpecies(species, m) {
  let best = null, val = -1;
  for (const k of species) { const sp = SPECIES_ACT[k]; if (sp && sp.a[m] > val) { val = sp.a[m]; best = k; } }
  return { key: best, activity: val < 0 ? 0 : val };
}
function thermalFactor(t) {
  if (t <= 15) return 1.0;
  if (t <= 18) return 1 - (t - 15) * 0.10;
  if (t <= 21) return 0.70 - (t - 18) * 0.16;
  return Math.max(0.08, 0.22 - (t - 21) * 0.05);
}
function flowFit(flow, mode) {
  const tb = { "Low / clear": {resident:0.85,run:0.55}, "Normal": {resident:1.0,run:0.85},
    "High / stained": {resident:0.70,run:1.0}, "Blown out": {resident:0.25,run:0.30} };
  return (tb[flow] || tb["Normal"])[mode];
}
function freshnessFactor(days, mode) { if (mode !== "run") return 1; if (days <= 1) return 0.7; if (days <= 4) return 1.0; if (days <= 8) return 0.8; return 0.55; }
function windFactor(w) { if (w == null) return 1; return w < 12 ? 1.0 : w < 25 ? 0.92 : w < 40 ? 0.70 : 0.45; }
function pressureFactor(tr) { if (tr == null) return 1; const a = Math.abs(tr); if (a < 1.5) return 1.0; if (tr < 0) return tr > -4 ? 1.08 : 0.95; return tr < 4 ? 0.90 : 0.80; }
function cloudFactor(c, flow) { if (c == null) return 1; if (c > 70) return 1.08; if (c < 30) return flow === "Low / clear" ? 0.85 : 0.95; return 1.0; }
function feedingWindow(now) { const h = now.getHours(); if ((h>=5&&h<8)||(h>=19&&h<22)) return 1.10; if (h>=11&&h<16) return 0.85; return 0.95; }

export function scoreSpot({ habitat, species, history }, weather, now = new Date()) {
  const m = now.getMonth();
  const bs = bestSpecies(species || [], m);
  const mode = (SPECIES_ACT[bs.key] && SPECIES_ACT[bs.key].mode) || "resident";
  const temp = modelStreamTemp(habitat.cold, weather.airMean);
  const flow = weather.flow || "Normal";
  const water = clamp100(100 * thermalFactor(temp) * flowFit(flow, mode) * freshnessFactor(weather.days ?? 4, mode));
  const weatherComp = clamp100(100 * windFactor(weather.wind) * pressureFactor(weather.pressureTrend) * cloudFactor(weather.cloud, flow));
  const time = clamp100(100 * feedingWindow(now));
  const seasonal = Math.round(100 * bs.activity);
  const hab = habitatComposite(habitat);
  let opp = 0.20*hab + 0.20*seasonal + 0.22*water + 0.18*weatherComp + 0.08*time + 0.07*(history ?? 60);
  if (temp >= 20) opp *= 0.5;
  return Math.round(clamp100(opp));
}
