/* Ontario / Great Lakes species inference from coarse spot traits.
   Returns species-key strings, most-likely first. Pure. */
export function inferSpecies(spot) {
  const { waterType, elevationM, nearGreatLakeKm, isTailwater } = spot;
  if (isTailwater) return ["BNT", "RBT", "BKT"];
  if (waterType === "lake") return ["SMB", "WAL", "NP", "PAN"];
  const nearLake = nearGreatLakeKm != null && nearGreatLakeKm <= 15;
  if (waterType === "river" && nearLake) return ["STL", "CHN", "BNT"];
  const cold = elevationM >= 350;
  if (waterType === "stream") {
    return cold ? ["BKT", "BNT", "RBT"] : ["BNT", "RBT", "SMB"];
  }
  // inland river
  return cold ? ["BNT", "RBT", "SMB"] : ["SMB", "WAL", "NP", "PAN"];
}
