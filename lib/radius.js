export const RADIUS_PRESETS = [
  { label: "30 km", m: 30000 }, { label: "60 km", m: 60000 },
  { label: "120 km", m: 120000 }, { label: "150 km", m: 150000 },
];
export function radiusLabel(m) {
  let best = RADIUS_PRESETS[0];
  for (const p of RADIUS_PRESETS) if (Math.abs(p.m - m) < Math.abs(best.m - m)) best = p;
  return best.label;
}
