/* Coarse habitat proxy for discovered spots. Pure. Values are deliberately
   conservative so curated reaches (with real numbers) outrank these. */
const clamp = (v) => Math.max(0, Math.min(100, Math.round(v)));

export function deriveHabitat(spot) {
  const { waterType, elevationM, isTailwater } = spot;
  // elevation 80..500 m maps to a cold contribution 0..55
  const elevCold = ((Math.max(80, Math.min(500, elevationM)) - 80) / 420) * 55;
  const streamBonus = waterType === "stream" ? 15 : 0;
  const tailBonus = isTailwater ? 40 : 0;
  const cold = clamp(30 + elevCold + streamBonus + tailBonus);
  const gw = clamp(cold - 10 + (waterType === "stream" ? 10 : 0));
  const ox = clamp(waterType === "lake" ? 60 : 72 + elevCold * 0.2);
  const struct = clamp(waterType === "lake" ? 65 : 60);
  const hold = clamp(waterType === "river" ? 68 : waterType === "lake" ? 60 : 55);
  const spawn = clamp(waterType === "stream" ? 65 : 55);
  return { hold, struct, spawn, cold, ox, gw };
}
