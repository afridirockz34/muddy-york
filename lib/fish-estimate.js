export function estimateFish({ species = [], holding, stocking, coldRetention = 60, month } = {}) {
  const list = species.map((k, i) => ({ key: k, likelihood: Math.max(20, 85 - i * 18) }));
  if (stocking && stocking.species) list.unshift({ key: stocking.species, likelihood: 90 });
  const deep = holding && (holding.deepHole || holding.poolScore >= 65);
  const cold = coldRetention >= 65;
  let sizeClass = "mixed";
  if (deep && cold) sizeClass = "larger";
  else if (!deep && coldRetention < 45) sizeClass = "small";
  const rationale = [];
  if (holding && holding.drivers) rationale.push(...holding.drivers);
  if (cold) rationale.push("cold-water hold favours bigger, older fish");
  let ageEstimate = "mixed year-classes";
  if (stocking && stocking.yearsAgo != null) {
    const y = stocking.yearsAgo;
    ageEstimate = deep ? `holdover fish ~${Math.max(1, y - 1)}–${y + 1} yrs plausible` : `mostly ~${y} yr fish`;
    rationale.push(`stocked ~${y} yr ago`);
  } else if (deep && cold) {
    ageEstimate = "holdover / larger fish plausible";
  }
  return { species: list.slice(0, 4), sizeClass, ageEstimate, rationale };
}
