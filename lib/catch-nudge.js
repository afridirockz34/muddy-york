export function catchNudge(momentum) {
  const m = Math.max(0, Math.min(1, momentum || 0));
  return Math.round(m * 6);
}
const HALF_LIFE_DAYS = 30;
export function momentumFrom(dates, now = new Date()) {
  if (!Array.isArray(dates) || !dates.length) return 0;
  const t = now.getTime();
  let sum = 0;
  for (const d of dates) {
    const days = (t - new Date(d).getTime()) / 86400000;
    if (days < 0) continue;
    sum += Math.pow(0.5, days / HALF_LIFE_DAYS); // decayed weight per catch
  }
  // saturate: ~4 recent catches ≈ full momentum
  return Math.max(0, Math.min(1, sum / 4));
}
