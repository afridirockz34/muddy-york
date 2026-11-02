import { prisma } from "../db.js";
import { sendMail, theRiver } from "../alerts/mailer.js";
import { scoreSpot } from "../alerts/score.js";
import { unsubUrl } from "../billing/email-tokens.js";
import { customerProfiles, RIVER_BY_ID } from "../customers/profile.js";
import { REACH_REGS } from "../../../lib/regs-reaches.js";
import { resolveReach, statusFor } from "../../../lib/regs-status.js";
import { currentZones } from "../regs/sync.js";
import { label } from "./run.js";

// Two welcome emails for new free members, from info@:
//   1. a day after sign-up: how the app helps on the rivers they looked at,
//      with today's score and season for each;
//   2. three days after that: what a morning with a membership looks like.
// If we don't know their rivers yet, each email has a general version.
// Only free members who haven't unsubscribed; it stops if they start a trial.

const DAY = 864e5;
const SITE = "https://muddyyorkfishing.ca";
const SPECIES = { BNT: "brown trout", BNTr: "brown trout", RBT: "rainbow trout", STL: "steelhead", CHN: "chinook salmon", COH: "coho salmon", ATS: "Atlantic salmon", BKT: "brook trout", LAT: "lake trout", PNK: "pink salmon" };
const join = (xs) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const sectionOf = (r) => String(r.section || "").replace(/^[A-Za-z ]+:\s*/, "").replace(/\s*[—–]\s*/g, ", ");
const joinUrl = (campaign) => `${SITE}/?join&utm_source=email&utm_medium=welcome&utm_campaign=${campaign}`;

export async function makeSeasonCheck(now = new Date()) {
  let zones = null;
  try { zones = (await currentZones()).zones; } catch { zones = null; }
  return (reach) => {
    if (!zones || !REACH_REGS[reach.id]) return null;
    const b = resolveReach(reach.id, zones);
    return (b && statusFor(b, reach.species || [], now)) || null;
  };
}

const MEMBER_PERKS = (one) => [
  "- **The technique and fly for today's water,** updated every morning",
  "- **Where to park and the walk in** to each stretch",
  `- **An alert when ${one ? theRiver(one) : "a river you save"} turns prime,** at most twice a week`,
  "- **The full run tracker** in spring and fall, and lakes to ice fish near you in winter",
];

// rivers: [{ reach, score?, season? }] — empty for the general version.
export function welcomeCopy(stage, { name, rivers, popular = [], hadTrial }) {
  const hi = `Hi ${name || "there"},`;
  const names = [...new Set(rivers.map((r) => r.reach.river))];
  const one = names[0];
  const cta = { label: hadTrial ? "Become a member" : "Start your 7 free days", url: joinUrl(`welcome-${stage}`) };
  const trialLine = hadTrial
    ? "Membership is month to month or yearly, and you can cancel anytime."
    : "Try it free for 7 days. If it isn't for you, cancel before the trial ends and you won't pay anything.";

  if (stage === 1 && rivers.length) {
    const blocks = rivers.map(({ reach, score, season }) => {
      const lines = [];
      if (score != null) lines.push(`- **Today:** ${score} out of 100, ${label(score).toLowerCase()}`);
      if (season?.state === "open") lines.push("- **Season:** in season today, per the Ontario regulations");
      else if (season?.state === "closed") lines.push("- **Season:** closed today. The app shows the rule for each stretch and which water nearby is open");
      else if (season) lines.push("- **Season:** varies by stretch. The app shows the rule for each one");
      const fish = [...new Set((reach.species || []).map((c) => SPECIES[c]).filter(Boolean))];
      if (fish.length) lines.push(`- **Holds:** ${join(fish)}`);
      return `**${reach.river}, ${sectionOf(reach)}**\n\n${lines.join("\n")}`;
    });
    const subject = `How we can help you fish ${theRiver(one)}`;
    return { subject, heading: subject, cta, text: `${hi}

Thanks for joining Muddy York Fishing. You were looking at ${join(names.map(theRiver))}, so here's where ${names.length > 1 ? "they stand" : "it stands"} today.

${blocks.join("\n\n")}

With a membership you also get, for ${names.length > 1 ? "each of these rivers" : theRiver(one)}:

${MEMBER_PERKS(one).join("\n")}

${trialLine}` };
  }

  if (stage === 1) {
    const subject = "Welcome to Muddy York Fishing: three things to try";
    return { subject, heading: subject, cta, text: `${hi}

Thanks for joining. Here's how to get the most from the app this week:

- **Save the rivers you fish.** Tap the star on any river and it stays at the top of your list.
- **Check the score each morning.** Every river gets a score out of 100 from water temperature, flow and weather, so you can pick where to go before you drive.
- **Look at the season tag.** Each stretch shows whether it's open today, from the Ontario regulations.
${popular.length ? `\nPopular with anglers in Southern Ontario this week: ${join(popular)}.\n` : ""}
Members also get:

${MEMBER_PERKS(null).join("\n")}

${trialLine}` };
  }

  // Stage 2: the morning with a membership.
  const where = one ? theRiver(one) : "a river you fish";
  const subject = one ? `Know the day ${theRiver(one)} turns good` : "Know the day your river turns good";
  const page = rivers.find((r) => r.reach.page)?.reach;
  return { subject, heading: subject, cta, text: `${hi}

The best days on the water are easy to miss when you only find out after. Here's what a morning looks like with a membership:

- **Your phone buzzes.** When ${where} reaches the level you set, you get one alert. Never on closed water, and at most twice a week.
- **Tap it, and the report opens.** Today's score, the season for that stretch, the water, the weather and the live gauge (where the river has one), all on one screen.
- **Tie on the right fly.** The approach and patterns for today's water.
- **Park and walk in.** Where to leave the car and how to reach the stretch, then tap Directions.

${trialLine}${page ? `

P.S. Today's conditions for ${theRiver(page.river)} are free on its page: ${SITE}${page.page}` : ""}` };
}

// The rivers people looked at most this week, for the general email.
async function popularRivers(now) {
  const rows = await prisma.event.groupBy({ by: ["ref"], where: { type: "view_reach", createdAt: { gte: new Date(now - 7 * DAY) }, ref: { not: null } }, _count: { _all: true } });
  const byRiver = new Map();
  for (const r of rows) { const x = RIVER_BY_ID.get(r.ref); if (x) byRiver.set(x.river, (byRiver.get(x.river) || 0) + r._count._all); }
  return [...byRiver.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n]) => theRiver(n));
}

export async function runWelcome({ now = new Date(), sendEmail = sendMail, fetchWeather, seasonOf, ignoreHour = false } = {}) {
  const hour = +new Date(now).toLocaleString("en-CA", { timeZone: "America/Toronto", hour: "numeric", hour12: false });
  if (!ignoreHour && (hour < 8 || hour > 19)) return { skipped: "outside 8 a.m. to 8 p.m." };
  const t = now.getTime();
  const users = await prisma.user.findMany({
    where: {
      emailOptOut: false, welcomeStage: { lt: 2 },
      createdAt: { gte: new Date(t - 10 * DAY), lte: new Date(t - DAY) },
      NOT: { email: { endsWith: "@appleid.local" } },
    },
    select: { id: true, welcomeStage: true, welcomeEmailAt: true, createdAt: true },
  });
  const due = users.filter((u) => (u.welcomeStage === 0 && t - u.createdAt.getTime() <= 3 * DAY)
    || (u.welcomeStage === 1 && u.welcomeEmailAt && t - u.welcomeEmailAt.getTime() >= 3 * DAY));
  if (!due.length) return { sent: 0 };

  const season = seasonOf || (await makeSeasonCheck(now));
  const weather = new Map();
  let popular = null, sent = 0;
  for (const u of due) {
    const [p] = await customerProfiles({ where: { id: u.id }, now });
    if (!p || p.plan !== "free") continue;
    const full = await prisma.user.findUnique({ where: { id: u.id }, include: { subscription: true } });
    const stage = u.welcomeStage + 1;
    const rivers = [];
    const seenRiver = new Set();
    for (const id of p.interestReaches) {
      const reach = RIVER_BY_ID.get(id);
      if (!reach || seenRiver.has(reach.river)) continue;
      seenRiver.add(reach.river);
      let score = null;
      if (stage === 1 && fetchWeather) {
        const key = `${reach.lat.toFixed(2)},${reach.lon.toFixed(2)}`;
        if (!weather.has(key)) weather.set(key, await fetchWeather(reach.lat, reach.lon).catch(() => null));
        const w = weather.get(key);
        if (w) score = scoreSpot({ habitat: reach.habitat, species: reach.species, history: reach.history }, w, now);
      }
      rivers.push({ reach, score, season: stage === 1 ? season(reach) : null });
      if (rivers.length === 3) break;
    }
    if (stage === 1 && !rivers.length && popular === null) popular = await popularRivers(t);
    const copy = welcomeCopy(stage, {
      name: full.usernameChosen ? full.displayName : null, rivers, popular: popular || [],
      hadTrial: !!full.subscription || !!full.trialEnd,
    });
    const ok = await sendEmail({ to: p.email, subject: copy.subject, heading: copy.heading, text: copy.text, cta: copy.cta, unsubscribe: unsubUrl(u.id) || undefined }).catch(() => false);
    if (!ok) continue;
    // Also counts as this week's free-member email, so the weekly roundup
    // doesn't land on top of it.
    await prisma.user.update({ where: { id: u.id }, data: { welcomeStage: stage, welcomeEmailAt: now, nurtureEmailAt: now } });
    sent++;
  }
  return { sent };
}
