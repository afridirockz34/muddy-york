import fs from "node:fs";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { resolveEntitlement } from "../billing/entitlement.js";

// One row per customer, shared by the admin list, the Excel export, the
// welcome emails and the MailerLite sync: who they are, what they pay for,
// how they found us, what they use, and which rivers they care about.

const RIVERS = JSON.parse(fs.readFileSync(new URL("../data/rivers.json", import.meta.url), "utf8"));
export const RIVER_BY_ID = new Map(RIVERS.map((r) => [r.id, r]));
const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const BY_PAGE = new Map(RIVERS.map((r) => [r.page, r]));
// River main pages (/rivers/credit-river/) cover every section of that river.
const BY_HUB = new Map(RIVERS.map((r) => [`/rivers/${slug(r.river)}/`, r]));

// A reach id or a page path, as the river it points at (or null).
export function riverFor(ref) {
  if (!ref) return null;
  if (RIVER_BY_ID.has(ref)) return RIVER_BY_ID.get(ref);
  const path = String(ref).split(/[?#]/)[0].replace(/\/?$/, "/");
  return BY_PAGE.get(path) || BY_HUB.get(path) || null;
}

export function planOf(user, now = new Date()) {
  const sub = user.subscription;
  const ent = resolveEntitlement({ status: sub?.status || null, currentPeriodEnd: sub?.currentPeriodEnd || null, trialEnd: user.trialEnd || null }, now);
  const yearly = sub?.priceId && sub.priceId === config.stripe.priceAnnual;
  const monthly = sub?.priceId && sub.priceId === config.stripe.priceMonthly;
  const term = yearly ? "yearly" : monthly ? "monthly" : "";
  if (ent === "trialing") return { plan: "trial", label: term ? `Free trial (${term})` : "Free trial" };
  if (ent === "active") return { plan: yearly ? "yearly" : "monthly", label: yearly ? "Yearly" : monthly ? "Monthly" : "Member" };
  if (user.giftUntil && new Date(user.giftUntil) > now) return { plan: "gift", label: "Gift membership" };
  if (sub) return { plan: "free", label: "Free (membership ended)" };
  return { plan: "free", label: "Free" };
}

const deviceLabel = (d) => {
  if (!d) return null;
  const parts = [d.type, d.os, d.browser].filter(Boolean);
  return parts.length ? parts.join(", ") + (d.standalone ? " (installed app)" : "") : null;
};
const sourceLabel = (s) => {
  const v = String(s || "").toLowerCase();
  if (!v || v === "direct") return "Direct";
  if (v === "google" || v.startsWith("search:")) return v === "google" ? "Google" : v.slice(7)[0].toUpperCase() + v.slice(8);
  if (/instagram|^ig$/.test(v)) return "Instagram";
  if (/facebook|^fb$/.test(v)) return "Facebook";
  if (/reddit/.test(v)) return "Reddit";
  if (/youtube/.test(v)) return "YouTube";
  if (/tiktok/.test(v)) return "TikTok";
  if (/^t$|twitter|^x$/.test(v)) return "X (Twitter)";
  if (/substack|mailerlite|newsletter|email/.test(v)) return "Newsletter";
  return s;
};

// Rivers a set of users looked at: saved first, then most viewed, with the
// first river each one landed on or opened. Works on the website too, since
// visits before sign-up are linked to the account when they sign in.
async function interestFor(userIds, savedByUser) {
  if (!userIds.length) return new Map();
  const rows = await prisma.event.groupBy({
    by: ["userId", "ref"],
    where: { userId: { in: userIds }, ref: { not: null }, type: { in: ["view_reach", "page_view", "save", "pageview", "landing"] } },
    _count: { _all: true }, _min: { createdAt: true },
  });
  const per = new Map();
  for (const r of rows) {
    const river = riverFor(r.ref);
    if (!river) continue;
    const m = per.get(r.userId) || new Map();
    const cur = m.get(river.river) || { river: river.river, reach: river, views: 0, first: r._min.createdAt, reachViews: new Map() };
    cur.views += r._count._all;
    if (r._min.createdAt < cur.first) cur.first = r._min.createdAt;
    cur.reachViews.set(river.id, (cur.reachViews.get(river.id) || 0) + r._count._all);
    m.set(river.river, cur);
    per.set(r.userId, m);
  }
  const out = new Map();
  for (const id of userIds) {
    const m = per.get(id) || new Map();
    const saved = (savedByUser.get(id) || []).map((s) => s.river);
    for (const v of m.values()) {
      const [best] = [...v.reachViews.entries()].sort((a, b) => b[1] - a[1]);
      v.reach = RIVER_BY_ID.get(best[0]) || v.reach;
    }
    const viewed = [...m.values()].sort((a, b) => b.views - a.views);
    const first = [...m.values()].sort((a, b) => a.first - b.first)[0] || null;
    out.set(id, { saved: [...new Set(saved)], viewed, first });
  }
  return out;
}

// Where each user came from and on what device: the first-touch record the
// app sends after sign-in, else their first session on the site or app.
async function originFor(userIds) {
  if (!userIds.length) return new Map();
  const events = await prisma.event.findMany({
    where: { userId: { in: userIds }, type: { in: ["acquisition", "session_start"] } },
    orderBy: { createdAt: "asc" }, select: { userId: true, type: true, meta: true, createdAt: true },
  });
  const out = new Map();
  for (const e of events) {
    const o = out.get(e.userId) || {};
    const m = e.meta || {};
    if (e.type === "acquisition" && !o.acq) o.acq = m;
    if (e.type === "session_start" && !o.first) o.first = m;
    if (e.type === "session_start") o.last = m;
    out.set(e.userId, o);
  }
  const res = new Map();
  for (const [id, o] of out) {
    const a = o.acq || {}, f = o.first || {};
    const src = a.source || f.source || null;
    res.set(id, {
      source: src ? sourceLabel(src) : null, sourceRaw: src,
      utmCampaign: a.utmCampaign || f.utmCampaign || null,
      referrer: a.referrer || f.referrer || null,
      landing: a.landing || f.landing || null,
      device: deviceLabel(a.device) || deviceLabel(f) || null,
      lastDevice: deviceLabel(o.last) || null,
    });
  }
  return res;
}

export async function customerProfiles({ where = {}, orderBy = { createdAt: "desc" }, take, skip, now = new Date() } = {}) {
  const users = await prisma.user.findMany({
    where, orderBy, take, skip,
    include: { subscription: true, savedSpots: { select: { ref: true, river: true, section: true } } },
  });
  const ids = users.map((u) => u.id);
  const savedByUser = new Map(users.map((u) => [u.id, u.savedSpots]));
  const [interest, origin, lastSeen] = await Promise.all([
    interestFor(ids, savedByUser),
    originFor(ids),
    ids.length ? prisma.event.groupBy({ by: ["userId"], where: { userId: { in: ids } }, _max: { createdAt: true } }) : [],
  ]);
  const seen = new Map(lastSeen.map((r) => [r.userId, r._max.createdAt]));
  return users.map((u) => {
    const i = interest.get(u.id) || { saved: [], viewed: [], first: null };
    const o = origin.get(u.id) || {};
    const p = planOf(u, now);
    return {
      id: u.id, email: u.email, username: u.displayName || null,
      plan: p.plan, planLabel: p.label,
      registered: u.createdAt.toISOString(),
      signIn: u.googleId ? (u.googleId.startsWith("apple:") ? "Apple" : "Google") : u.passwordHash ? "Email" : "Other",
      source: o.source || null, sourceRaw: o.sourceRaw || null, utmCampaign: o.utmCampaign || null, referrer: o.referrer || null,
      landing: o.landing || null, device: o.device || null, lastDevice: o.lastDevice || null,
      topRiver: i.viewed[0]?.river || i.saved[0] || null,
      firstRiver: i.first?.river || null,
      rivers: [...new Set([...i.saved, ...i.viewed.map((v) => v.river)])].slice(0, 5),
      savedRivers: i.saved,
      interestReaches: [...new Set([...u.savedSpots.map((s) => s.ref).filter((r) => RIVER_BY_ID.has(r)), ...i.viewed.map((v) => v.reach.id)])],
      emailOptOut: !!u.emailOptOut, emailConsent: !!u.emailConsentAt,
      lastActive: seen.get(u.id) ? seen.get(u.id).toISOString() : null,
    };
  });
}

// The one-line "interest" for a list or a spreadsheet cell.
export function interestText(p) {
  const parts = [];
  if (p.topRiver) parts.push(`Most viewed: ${p.topRiver}`);
  if (p.firstRiver && p.firstRiver !== p.topRiver) parts.push(`first looked at: ${p.firstRiver}`);
  if (p.savedRivers.length) parts.push(`saved: ${p.savedRivers.join(", ")}`);
  return parts.join("; ");
}
