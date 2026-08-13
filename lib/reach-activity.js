import { momentumFrom } from "./catch-nudge.js";

// Aggregate customer logs (catches + note pins) into per-reach intelligence used
// to sharpen recommendations: recent activity/momentum (boosts the opportunity
// score) and the species/sizes actually being logged (sharpens the fish
// estimate). Pure and testable. A note is a softer signal than a catch.
export function reachActivity({ catches = [], notes = [], now = Date.now(), windowDays = 90 } = {}) {
  const cutoff = now - windowDays * 86400000;
  const cutoff30 = now - 30 * 86400000;
  const byRef = new Map();
  const get = (ref) => {
    if (!byRef.has(ref)) byRef.set(ref, { catchDates: [], noteDates: [], species: {}, sizes: {} });
    return byRef.get(ref);
  };
  for (const c of catches) {
    if (!c || !c.ref) continue;
    const t = new Date(c.caughtAt).getTime();
    if (!(t >= cutoff)) continue;
    const g = get(c.ref);
    g.catchDates.push(t);
    if (c.species) {
      g.species[c.species] = (g.species[c.species] || 0) + 1;
      if (c.sizeInches > 0) (g.sizes[c.species] || (g.sizes[c.species] = [])).push(c.sizeInches);
    }
  }
  for (const n of notes) {
    if (!n || !n.ref) continue;
    const t = new Date(n.createdAt).getTime();
    if (!(t >= cutoff)) continue;
    const g = get(n.ref);
    g.noteDates.push(t);
    if (n.species) g.species[n.species] = (g.species[n.species] || 0) + 0.5; // softer than a catch
  }
  const out = {};
  for (const [ref, g] of byRef) {
    const all = [...g.catchDates, ...g.noteDates];
    const lastDays = all.length ? Math.round((now - Math.max(...all)) / 86400000) : null;
    const momentum = +momentumFrom(all.map((t) => new Date(t).toISOString()), new Date(now)).toFixed(3);
    const topSpecies = Object.entries(g.species).sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([species, n]) => ({ species, n: +n.toFixed(1) }));
    const sizeBySpecies = {};
    for (const [sp, arr] of Object.entries(g.sizes)) {
      if (arr.length) sizeBySpecies[sp] = { avg: +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1), max: Math.max(...arr), n: arr.length };
    }
    out[ref] = {
      count30d: g.catchDates.filter((t) => t >= cutoff30).length,
      notes30d: g.noteDates.filter((t) => t >= cutoff30).length,
      lastDays, momentum, topSpecies, sizeBySpecies,
    };
  }
  return out;
}
