import fs from "node:fs";
import { prisma } from "../db.js";
import { resolveEntitlement } from "../billing/entitlement.js";
import { scoreSpot } from "../alerts/score.js";
import { sendMail } from "../alerts/mailer.js";
import { unsubUrl } from "../billing/email-tokens.js";

// Free-member nudges. The idea is "show, then offer": tell a free member
// something true and useful about a river THEY looked at (the app or the
// website), keep back the part members get (the fly, the parking, the
// stretch-by-stretch rules), and offer the trial once, clearly.
//
// Rules that keep it from being annoying:
// - Only rivers the person looked at or saved in the last 21 days.
// - A push only when one of those rivers is actually prime (75+) today.
// - At most 2 pushes and 1 email a week; never a push and an email the same
//   day; nothing if they got a prime alert for that river in the last 20 h.
// - Nothing for people inactive for 8 weeks, members, or anyone unsubscribed.

const DAY = 864e5;
const RIVERS = JSON.parse(fs.readFileSync(new URL("../data/rivers.json", import.meta.url), "utf8"));
const RIVER_BY_ID = new Map(RIVERS.map((r) => [r.id, r]));
const SITE = "https://muddyyorkfishing.ca";
export const PRIME = 75;
export const label = (s) => (s >= 80 ? "Excellent" : s >= 65 ? "Good" : s >= 50 ? "Fair" : s >= 35 ? "Tough" : "Poor");
const recent = (log, now, days) => (Array.isArray(log) ? log : []).filter((t) => now - new Date(t).getTime() < days * DAY);

// The rivers a person cares about: saved, then most viewed recently.
async function interestOf(user, now) {
  const events = await prisma.event.findMany({
    where: { userId: user.id, createdAt: { gte: new Date(now - 21 * DAY) }, type: { in: ["view_reach", "page_view", "save"] }, ref: { not: null } },
    select: { ref: true, createdAt: true },
  });
  const count = new Map();
  for (const e of events) if (RIVER_BY_ID.has(e.ref)) count.set(e.ref, (count.get(e.ref) || 0) + 1);
  const saved = (user.savedSpots || []).map((s) => ({ id: s.ref, river: s.river, section: s.section, lat: s.lat, lon: s.lon, habitat: s.habitat, species: s.species, history: s.history, saved: true }));
  const viewed = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => ({ ...RIVER_BY_ID.get(id) }));
  const seen = new Set(); const out = [];
  for (const r of [...saved, ...viewed]) { if (seen.has(r.id)) continue; seen.add(r.id); out.push(r); }
  return out.slice(0, 3);
}

export function nudgeCopy(user, picks, { hadTrial }) {
  const top = picks[0];
  const cta = hadTrial ? "Become a member" : "Start your 7 free days";
  const push = {
    title: `The ${top.river} is ${label(top.score).toLowerCase()} today (${top.score}/100)`,
    body: `Conditions just lined up on a river you looked at. ${hadTrial ? "Members" : "Free for 7 days, members"} get the fly to tie on and where to park.`,
    url: "/", tag: "free-nudge",
  };
  const lines = picks.map((p) => `- ${p.river}, ${p.section}: ${label(p.score)} today (${p.score}/100)${p.page ? `\n  ${SITE}${p.page}` : ""}`).join("\n");
  const email = {
    subject: top.score >= PRIME ? `The ${top.river} is ${label(top.score).toLowerCase()} today` : `How your rivers look this week`,
    text: `Hi ${user.displayName || "there"},

Here's how the rivers you've been looking at score this morning:

${lines}

${top.score >= PRIME ? `The ${top.river} is the pick today.` : `None are prime yet. We'll tell you when one is.`} Members also see the technique and fly for today's water, parking and the walk in, the official season for each stretch, and get one alert when a saved river turns prime.`,
    cta: { label: cta, url: `${SITE}/?join` },
  };
  return { push, email };
}

export async function runNurture({ now = new Date(), fetchWeather, sendEmail = sendMail, sendPush, ignoreHour = false } = {}) {
  const hour = +new Date(now).toLocaleString("en-CA", { timeZone: "America/Toronto", hour: "numeric", hour12: false });
  if (!ignoreHour && (hour < 7 || hour > 9)) return { skipped: "outside 7-9" };
  const t = now.getTime();
  const users = await prisma.user.findMany({
    where: { createdAt: { lte: new Date(t - DAY) } },
    include: { subscription: true, savedSpots: true, pushSubs: { select: { id: true } } },
  });
  let pushes = 0, emails = 0;
  const weather = new Map();
  for (const u of users) {
    const ent = resolveEntitlement({ status: u.subscription?.status || null, currentPeriodEnd: u.subscription?.currentPeriodEnd || null, trialEnd: u.trialEnd || null }, now);
    if (ent !== "free" || (u.giftUntil && new Date(u.giftUntil).getTime() > t)) continue;
    const last = await prisma.event.findFirst({ where: { userId: u.id }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
    if (!last || t - last.createdAt.getTime() > 56 * DAY) continue; // dormant: leave them be
    const rivers = await interestOf(u, t);
    if (!rivers.length) continue;
    const picks = [];
    for (const r of rivers) {
      const key = `${r.lat.toFixed(2)},${r.lon.toFixed(2)}`;
      if (!weather.has(key)) weather.set(key, await fetchWeather(r.lat, r.lon).catch(() => null));
      const w = weather.get(key);
      if (!w) continue;
      picks.push({ ...r, page: r.page || RIVER_BY_ID.get(r.id)?.page || null, score: scoreSpot({ habitat: r.habitat, species: r.species, history: r.history }, w, now) });
    }
    if (!picks.length) continue;
    picks.sort((a, b) => b.score - a.score);
    const hadTrial = !!u.subscription || !!u.trialEnd;
    const copy = nudgeCopy(u, picks, { hadTrial });
    const pushLog = recent(u.nurturePushLog, t, 7);
    const alertedToday = u.lastAlertAt && t - new Date(u.lastAlertAt).getTime() < 20 * 3600e3;
    const emailedToday = u.nurtureEmailAt && t - new Date(u.nurtureEmailAt).getTime() < DAY;
    const pushedToday = pushLog.some((x) => t - new Date(x).getTime() < DAY);
    const prime = picks[0].score >= PRIME;

    if (prime && sendPush && u.pushSubs.length && pushLog.length < 2 && !alertedToday && !emailedToday) {
      if (await sendPush(u.id, copy.push).catch(() => false)) {
        await prisma.user.update({ where: { id: u.id }, data: { nurturePushLog: [...pushLog, now.toISOString()] } });
        pushes++;
        continue;
      }
    }
    // Email: prime days, or the weekly roundup on Thursday (weekend planning).
    const thursday = new Date(now).toLocaleDateString("en-CA", { timeZone: "America/Toronto", weekday: "long" }) === "Thursday";
    const emailOk = !u.emailOptOut && (!u.nurtureEmailAt || t - new Date(u.nurtureEmailAt).getTime() >= 7 * DAY) && !pushedToday && !alertedToday;
    if (emailOk && (prime || thursday)) {
      const unsub = unsubUrl(u.id);
      const ok = await sendEmail({ to: u.email, subject: copy.email.subject, heading: copy.email.subject, text: copy.email.text, cta: copy.email.cta, unsubscribe: unsub || undefined }).catch(() => false);
      if (ok) { await prisma.user.update({ where: { id: u.id }, data: { nurtureEmailAt: now } }); emails++; }
    }
  }
  return { pushes, emails };
}

export function scheduleNurture({ fetchWeather, sendPush, log = console } = {}) {
  let busy = false;
  const run = async () => {
    if (busy) return; busy = true;
    try { const r = await runNurture({ fetchWeather, sendPush }); if (r.pushes || r.emails) log.info?.({ nurture: r }, "free-member nudges"); }
    catch (e) { log.error?.({ err: e }, "free-member nudges failed"); }
    finally { busy = false; }
  };
  setTimeout(run, 120_000);
  return setInterval(run, 60 * 60 * 1000);
}
