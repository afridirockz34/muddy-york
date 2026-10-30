import { prisma } from "../db.js";
import { scoreSpot } from "./score.js";
import { theRiver } from "./mailer.js";
import { decideSpot, recentAlerts, userCanReceive } from "./decide.js";
import { REACH_REGS } from "../../../lib/regs-reaches.js";
import { resolveReach, statusFor } from "../../../lib/regs-status.js";
import { currentZones } from "../regs/sync.js";

// Is this saved stretch closed to every species it holds today, per the
// official summary? Never alert "prime conditions" on closed water.
export async function makeClosedCheck(now = new Date()) {
  let zones = null;
  try { zones = (await currentZones()).zones; } catch { zones = null; }
  return (spot) => {
    if (!zones || !REACH_REGS[spot.ref]) return false;
    const b = resolveReach(spot.ref, zones);
    const st = b && statusFor(b, Array.isArray(spot.species) ? spot.species : [], now);
    return !!st && st.state === "closed";
  };
}

export async function runAlerts({ now = new Date(), fetchWeather, sendEmail, sendPush, isClosed } = {}) {
  const closed = isClosed || (await makeClosedCheck(now));
  // Anyone who wants email OR has a push subscription.
  const users = await prisma.user.findMany({
    where: { OR: [{ alertEmail: true }, { pushSubs: { some: {} } }] },
    include: { savedSpots: true },
  });
  let evaluated = 0, sent = 0;
  for (const user of users) {
    const due = [];
    for (const spot of user.savedSpots) {
      if (closed(spot)) continue;
      evaluated++;
      let weather;
      try { weather = await fetchWeather(spot.lat, spot.lon); } catch { continue; }
      if (!weather) continue;
      const opportunity = scoreSpot({ habitat: spot.habitat, species: spot.species, history: spot.history }, weather, now);
      const d = decideSpot({ opportunity, threshold: user.alertThreshold, armed: spot.alertArmed, log: spot.alertLog }, now);
      if (d.send) due.push({ spot, opportunity });
      else if (d.armed !== spot.alertArmed) {
        await prisma.savedSpot.update({ where: { id: spot.id }, data: { alertArmed: d.armed } });
      }
    }
    if (!due.length) continue;
    // One message per user per window. Rivers that crossed while the user was
    // in the quiet window stay armed, so they can still alert next time.
    if (!userCanReceive(user.lastAlertAt, now)) continue;
    due.sort((a, b) => b.opportunity - a.opportunity);
    const top = due[0];
    const more = due.length - 1;
    let ok = false;
    if (user.alertEmail && sendEmail) ok = (await sendEmail(user.email, top.spot, top.opportunity, due.slice(1).map((d) => d.spot))) || ok;
    if (sendPush) ok = (await sendPush(user.id, {
      title: more ? `Prime conditions on ${due.length} of your rivers` : `Prime conditions on ${theRiver(top.spot.river)}`,
      body: more
        ? `${top.spot.river} is at ${top.opportunity}/100, plus ${due.slice(1).map((d) => d.spot.river).join(", ")}.`
        : `${String(top.spot.section || "").replace(/\s*[—–]\s*/g, ": ")} is at ${top.opportunity}/100 right now. Tight lines.`,
      url: more ? "/" : `/?river=${encodeURIComponent(top.spot.ref)}`,
      tag: "prime-conditions",
    })) || ok;
    if (!ok) continue;
    sent++;
    await prisma.user.update({ where: { id: user.id }, data: { lastAlertAt: now } });
    for (const { spot } of due) {
      await prisma.savedSpot.update({ where: { id: spot.id }, data: {
        lastAlertAt: now, alertArmed: false, alertLog: [...recentAlerts(spot.alertLog, now), now.toISOString()],
      } });
    }
  }
  return { evaluated, sent };
}
