import { prisma } from "../db.js";
import { sendPushToUser } from "../push/sender.js";
import { torontoDay } from "../routes/field-reports.js";

// The morning after someone taps Directions, ask how the trip went: one push
// per person per morning, naming the river. Blank days count, and that's what
// makes the score measurable. Runs hourly; sends between 8 and 10 a.m. Toronto.
export async function sendTripReminders({ now = new Date(), send = sendPushToUser } = {}) {
  const hour = +new Date(now).toLocaleString("en-CA", { timeZone: "America/Toronto", hour: "numeric", hour12: false });
  if (hour < 8 || hour > 10) return { sent: 0, skipped: "outside 8-10" };
  const yesterday = torontoDay(new Date(now.getTime() - 864e5));
  const intents = await prisma.tripIntent.findMany({ where: { dayKey: yesterday, remindedAt: null, doneAt: null }, orderBy: { createdAt: "desc" } });
  const byUser = new Map();
  for (const it of intents) { if (!byUser.has(it.userId)) byUser.set(it.userId, []); byUser.get(it.userId).push(it); }
  let sent = 0;
  for (const [userId, list] of byUser) {
    const top = list[0];
    const ok = await send(userId, {
      title: `How was the ${top.river || "river"} yesterday?`,
      body: "Ten seconds: did you catch anything? Blank days count too, and they make the scores better for everyone.",
      url: `/?report=${top.id}`, tag: "trip-report",
    }).catch(() => false);
    await prisma.tripIntent.updateMany({ where: { id: { in: list.map((x) => x.id) } }, data: { remindedAt: now } });
    if (ok) sent++;
  }
  return { sent, users: byUser.size };
}

export function scheduleTripReminders(log = console) {
  let busy = false;
  const run = async () => {
    if (busy) return; busy = true;
    try { const r = await sendTripReminders(); if (r.sent) log.info?.({ tripReminders: r }, "trip reminders"); }
    catch (e) { log.error?.({ err: e }, "trip reminders failed"); }
    finally { busy = false; }
  };
  setTimeout(run, 90_000);
  return setInterval(run, 60 * 60 * 1000);
}
