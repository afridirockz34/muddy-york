export function estimateFish({ species = [], holding, stocking, coldRetention = 60, month, logged } = {}) {
  const list = species.map((k, i) => ({ key: k, likelihood: Math.max(20, 85 - i * 18) }));
  if (stocking && stocking.species) list.unshift({ key: stocking.species, likelihood: 90 });
  // Real customer logs (species actually being caught/noted here) lead the list.
  const loggedTop = (logged && logged.topSpecies) || [];
  for (let i = loggedTop.length - 1; i >= 0; i--) list.unshift({ key: loggedTop[i].species, likelihood: 92 });
  const deep = holding && (holding.deepHole || holding.poolScore >= 65);
  const cold = coldRetention >= 65;
  let sizeClass = "mixed";
  if (deep && cold) sizeClass = "larger";
  else if (!deep && coldRetention < 45) sizeClass = "small";
  // Hard evidence of big fish being logged overrides the model.
  const sizes = (logged && logged.sizeBySpecies) || {};
  const bigLogged = Object.values(sizes).some((s) => s && (s.max >= 20 || s.avg >= 17));
  if (bigLogged) sizeClass = "larger";
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
