// Turn Ontario's fish-stocking FeatureServer response into angler-facing news
// items: group by waterbody + species + year, sum the counts, and surface the
// freshest salmonid stockings first. Pure and testable.
const pick = (a, keys) => { for (const k of keys) if (a[k] != null && a[k] !== "") return a[k]; return null; };
const SALMONID = /trout|salmon|steelhead|splake|char/i;

export function stockingNews(json, { limit = 6, minYear = 0 } = {}) {
  const feats = (json && json.features) || [];
  const groups = new Map();
  for (const f of feats) {
    const a = f.attributes || {};
    let yr = pick(a, ["Stocking_Year"]);
    if (yr && yr > 1e9) yr = new Date(yr).getFullYear();
    yr = yr ? +yr : null;
    if (!yr || yr < minYear) continue;
    const species = pick(a, ["Species"]);
    let water = pick(a, ["Official_Waterbody_Name", "Unoffcial_Waterbody_Name"]);
    if (!species || !water) continue;
    water = String(water).replace(/\s*\(unofficial name\)\s*$/i, "").trim();
    const count = +pick(a, ["Number_of_Fish_Stocked"]) || 0;
    const key = `${water}|${species}|${yr}`;
    const g = groups.get(key) || { water, species, year: yr, count: 0 };
    g.count += count;
    groups.set(key, g);
  }
  return [...groups.values()]
    .sort((x, y) =>
      (SALMONID.test(y.species) ? 1 : 0) - (SALMONID.test(x.species) ? 1 : 0) ||
      y.year - x.year || y.count - x.count)
    .slice(0, limit)
    .map((g) => ({
      id: ("stock-" + g.water + "-" + g.species + "-" + g.year).replace(/[^a-z0-9]+/gi, "_"),
      species: g.species, water: g.water, year: g.year, count: g.count,
    }));
}
