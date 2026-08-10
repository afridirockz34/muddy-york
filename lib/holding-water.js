const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function holdingWater(reach) {
  const { isTailwater, waterType, gradientPct = 1, sinuosity = 1, nearConfluence, belowLake, soundedMaxDepthM } = reach || {};
  const drivers = [];
  if (soundedMaxDepthM != null) {
    drivers.push(`sounded depth ${soundedMaxDepthM} m`);
    const cls = soundedMaxDepthM >= 6 ? "deep-pool" : soundedMaxDepthM >= 3 ? "pool" : soundedMaxDepthM >= 1.2 ? "run" : "riffle";
    return { poolScore: clamp(Math.round(40 + soundedMaxDepthM * 7), 0, 100), class: cls, deepHole: soundedMaxDepthM >= 6, drivers };
  }
  let s = 30;
  if (isTailwater) { s += 28; drivers.push("tailwater plunge pool below a dam"); }
  if (nearConfluence) { s += 16; drivers.push("scour hole at a confluence"); }
  if (belowLake) { s += 10; drivers.push("deeper flow below a lake"); }
  if (gradientPct <= 0.3) { s += 18; drivers.push("low-gradient slow water"); }
  else if (gradientPct >= 2.5) { s -= 18; drivers.push("steep riffle water"); }
  if (sinuosity >= 1.3) { s += 12; drivers.push("meander bends with undercut banks"); }
  if (waterType === "river") s += 6; else if (waterType === "stream") s -= 4;
  const poolScore = clamp(Math.round(s), 0, 100);
  const cls = poolScore >= 72 ? "deep-pool" : poolScore >= 55 ? "pool" : poolScore >= 40 ? "run" : "riffle";
  return { poolScore, class: cls, deepHole: poolScore >= 72, drivers };
}
