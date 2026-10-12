// How often members caught fish on days we scored high versus low. The public
// accuracy line and next spring's recalibration both start from this.
export const ACCURACY_TARGET = 300;
const BANDS = [["80+", 80, 101], ["60 to 79", 60, 80], ["Under 60", 0, 60]];
export function scoreAccuracy(reports) {
  const usable = reports.filter((r) => r.fished && Number.isFinite(r.scoreAtTrip));
  const bands = BANDS.map(([label, lo, hi]) => {
    const inBand = usable.filter((r) => r.scoreAtTrip >= lo && r.scoreAtTrip < hi);
    const caught = inBand.filter((r) => r.caught > 0).length;
    return { label, trips: inBand.length, caughtRate: inBand.length ? Math.round((100 * caught) / inBand.length) : null };
  });
  return { trips: usable.length, target: ACCURACY_TARGET, ready: usable.length >= ACCURACY_TARGET, bands };
}
