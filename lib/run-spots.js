// Salmon and steelhead run spots tracked by the run tracker. Slugs match the
// public /salmon-run/ pages (marketing/seo-content.mjs SALMON_SPOTS); river is
// the app's river id where we cover it. Coordinates are the viewing area.
export const RUN_SPOTS = [
  { slug: "humber-river-old-mill-toronto", place: "Old Mill, Toronto", river: "humber-lower", lat: 43.6495, lon: -79.4945 },
  { slug: "credit-river-mississauga", place: "Erindale and Port Credit", river: "credit-lower", lat: 43.551, lon: -79.660 },
  { slug: "oakville-sixteen-mile-creek", place: "Oakville", river: "sixteen", lat: 43.470, lon: -79.720 },
  { slug: "duffins-creek-ajax", place: "Ajax and Pickering", river: "duffins", lat: 43.840, lon: -79.040 },
  { slug: "oshawa-creek", place: "Oshawa", river: null, lat: 43.880, lon: -78.870 },
  { slug: "bowmanville-creek", place: "Bowmanville", river: "bowmanville", lat: 43.905, lon: -78.688 },
  { slug: "port-hope-ganaraska-river", place: "Port Hope", river: "ganaraska", lat: 43.958, lon: -78.300 },
  { slug: "owen-sound-sydenham-river", place: "Owen Sound", river: "sydenham-os", lat: 44.566, lon: -80.946 },
  { slug: "sauble-falls", place: "Sauble Falls", river: "sauble", lat: 44.676, lon: -81.258 },
];
export const RUN_STATES = ["none", "staging", "moving", "stacked", "spawning", "spent"];
export const RUN_LABEL = { none: "No fish seen", staging: "Staging at the mouth", moving: "Moving upstream", stacked: "Stacked below barriers", spawning: "Spawning", spent: "Winding down" };
export const isRunSpot = (slug) => RUN_SPOTS.some((s) => s.slug === slug);

// Summarize recent sightings: the state most reported in the last 3 days
// (falling back to 7), plus counts. Pure, so the app and server agree.
export function runSummary(checkins, now = Date.now()) {
  const day = 864e5;
  const last7 = checkins.filter((c) => now - new Date(c.createdAt).getTime() <= 7 * day);
  const recent = last7.filter((c) => now - new Date(c.createdAt).getTime() <= 3 * day);
  const pick = (list) => {
    const n = {}; for (const c of list) n[c.status] = (n[c.status] || 0) + 1;
    let best = null; for (const k of RUN_STATES) if (n[k] && (!best || n[k] > n[best])) best = k;
    return best;
  };
  const counts = {}; for (const c of last7) counts[c.status] = (counts[c.status] || 0) + 1;
  const lastAt = last7.reduce((m, c) => Math.max(m, new Date(c.createdAt).getTime()), 0);
  return { state: pick(recent) || pick(last7), reports7: last7.length, counts, lastReportAt: lastAt ? new Date(lastAt).toISOString() : null };
}
