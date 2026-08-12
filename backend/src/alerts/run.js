import { prisma } from "../db.js";
import { scoreSpot } from "./score.js";
import { shouldAlert } from "./decide.js";

export async function runAlerts({ now = new Date(), fetchWeather, sendEmail, sendPush } = {}) {
  // Anyone who wants email OR has a push subscription.
  const users = await prisma.user.findMany({
    where: { OR: [{ alertEmail: true }, { pushSubs: { some: {} } }] },
    include: { savedSpots: true },
  });
  let evaluated = 0, sent = 0;
  for (const user of users) {
    for (const spot of user.savedSpots) {
      evaluated++;
      let weather;
      try { weather = await fetchWeather(spot.lat, spot.lon); } catch { continue; }
      if (!weather) continue;
      const opportunity = scoreSpot({ habitat: spot.habitat, species: spot.species, history: spot.history }, weather, now);
      if (!shouldAlert({ opportunity, threshold: user.alertThreshold, lastAlertAt: spot.lastAlertAt }, now)) continue;
      let ok = false;
      if (user.alertEmail && sendEmail) ok = (await sendEmail(user.email, spot, opportunity)) || ok;
      if (sendPush) ok = (await sendPush(user.id, {
        title: `Prime conditions on the ${spot.river}`,
        body: `${spot.section} is at ${opportunity}/100 right now. Tight lines.`,
        url: "/",
      })) || ok;
      if (ok) {
        await prisma.savedSpot.update({ where: { id: spot.id }, data: { lastAlertAt: now } });
        sent++;
      }
    }
  }
  return { evaluated, sent };
}
