import { prisma } from "../db.js";
import { customerProfiles } from "../customers/profile.js";

// Keep a MailerLite group in step with the app's users, so the newsletter
// list is always current without anyone exporting files.
//
// - Every account that hasn't unsubscribed is added to (or updated in) one
//   group, with plan, sign-up date, source, device and favourite river.
// - An unsubscribe goes both ways: unsubscribing in MailerLite stops our
//   emails, and unsubscribing from ours marks them unsubscribed in MailerLite.
//   We never resubscribe anyone: updates leave a subscriber's status alone.
// - Off unless MAILERLITE_API_KEY is set (Render environment).

const API = "https://connect.mailerlite.com/api";
export const GROUP_NAME = () => process.env.MAILERLITE_GROUP || "Muddy York app users";
export const enabled = () => !!process.env.MAILERLITE_API_KEY;
const realEmail = (e) => !!e && !/@appleid\.local$/i.test(e);

// Custom fields we keep up to date (key: [name, type]).
const FIELDS = {
  plan: ["Plan", "text"],
  signup_date: ["Signup date", "date"],
  source: ["Source", "text"],
  device: ["Device", "text"],
  river_interest: ["River interest", "text"],
  email_consent: ["Email consent", "text"],
};

function client(fetchImpl = fetch) {
  return async function api(path, { method = "GET", body } = {}) {
    const res = await fetchImpl(API + path, {
      method,
      headers: { Authorization: `Bearer ${process.env.MAILERLITE_API_KEY}`, "Content-Type": "application/json", Accept: "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 204) return {};
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(`mailerlite ${method} ${path}: ${res.status} ${data.message || ""}`.trim()); e.status = res.status; throw e; }
    return data;
  };
}

async function ensureGroup(api) {
  const name = GROUP_NAME();
  const found = await api(`/groups?filter[name]=${encodeURIComponent(name)}&limit=50`);
  const g = (found.data || []).find((x) => x.name === name);
  if (g) return g.id;
  return (await api("/groups", { method: "POST", body: { name } })).data.id;
}

async function ensureFields(api) {
  const have = new Set(((await api("/fields?limit=100")).data || []).map((f) => f.key));
  for (const [key, [name, type]] of Object.entries(FIELDS)) {
    if (!have.has(key)) await api("/fields", { method: "POST", body: { name, type } }).catch(() => {});
  }
}

export function subscriberBody(p, groupId) {
  return {
    email: p.email,
    fields: {
      name: p.username || "",
      plan: p.planLabel,
      signup_date: p.registered.slice(0, 10),
      source: p.source || "Direct",
      device: p.device || "",
      river_interest: p.topRiver || p.savedRivers[0] || "",
      email_consent: p.emailConsent ? "Agreed at sign-up" : "Account before Nov 2026",
    },
    groups: [groupId],
    // No "status": a new subscriber is active, and an existing one keeps
    // whatever status they have (so an unsubscribe in MailerLite sticks).
  };
}

// Every unsubscribed (or spam-complaint) address in MailerLite.
async function mailerliteUnsubscribes(api) {
  const out = new Set();
  for (const status of ["unsubscribed", "junk"]) {
    let cursor = "";
    for (let page = 0; page < 200; page++) {
      const r = await api(`/subscribers?filter[status]=${status}&limit=500${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
      for (const s of r.data || []) out.add(String(s.email).toLowerCase());
      cursor = r.meta?.next_cursor;
      if (!cursor) break;
    }
  }
  return out;
}

// MailerLite's batch endpoint takes up to 50 requests at a time.
async function batch(api, requests) {
  let failed = 0;
  for (let i = 0; i < requests.length; i += 50) {
    const r = await api("/batch", { method: "POST", body: { requests: requests.slice(i, i + 50) } });
    failed += r.failed || 0;
  }
  return failed;
}

export async function syncAll({ fetchImpl = fetch, log = console } = {}) {
  if (!enabled()) return { skipped: "MAILERLITE_API_KEY not set" };
  const api = client(fetchImpl);
  const groupId = await ensureGroup(api);
  await ensureFields(api);

  // 1. Pull unsubscribes from MailerLite into the app.
  const theirs = await mailerliteUnsubscribes(api);
  let optedOut = 0;
  if (theirs.size) {
    const r = await prisma.user.updateMany({ where: { email: { in: [...theirs] }, emailOptOut: false }, data: { emailOptOut: true } });
    optedOut = r.count;
  }

  // 2. Push everyone else in; mark our unsubscribes as unsubscribed there.
  const profiles = (await customerProfiles({ orderBy: { createdAt: "asc" } })).filter((p) => realEmail(p.email));
  const requests = [];
  let added = 0, unsubscribed = 0;
  for (const p of profiles) {
    if (p.emailOptOut || theirs.has(p.email.toLowerCase())) {
      if (!theirs.has(p.email.toLowerCase())) { requests.push({ method: "POST", path: "api/subscribers", body: { email: p.email, status: "unsubscribed" } }); unsubscribed++; }
      continue;
    }
    requests.push({ method: "POST", path: "api/subscribers", body: subscriberBody(p, groupId) });
    added++;
  }
  const failed = await batch(api, requests);
  const result = { synced: added, unsubscribed, optedOutFromMailerLite: optedOut, failed, group: GROUP_NAME() };
  log.info?.({ mailerlite: result }, "mailerlite sync");
  return result;
}

// Right away, for one person (a new sign-up). Fire and forget.
export async function syncUser(userId, { fetchImpl = fetch } = {}) {
  if (!enabled()) return false;
  try {
    const api = client(fetchImpl);
    const [p] = await customerProfiles({ where: { id: userId } });
    if (!p || !realEmail(p.email) || p.emailOptOut) return false;
    await api("/subscribers", { method: "POST", body: subscriberBody(p, await ensureGroup(api)) });
    return true;
  } catch { return false; }
}

export async function unsubscribeEmail(email, { fetchImpl = fetch } = {}) {
  if (!enabled() || !realEmail(email)) return false;
  try { await client(fetchImpl)("/subscribers", { method: "POST", body: { email, status: "unsubscribed" } }); return true; }
  catch { return false; }
}

// When a customer is deleted, remove them from MailerLite as well.
export async function forgetEmail(email, { fetchImpl = fetch } = {}) {
  if (!enabled() || !realEmail(email)) return false;
  try {
    const api = client(fetchImpl);
    const s = await api(`/subscribers/${encodeURIComponent(email)}`);
    if (s.data?.id) await api(`/subscribers/${s.data.id}/forget`, { method: "POST" });
    return true;
  } catch { return false; }
}

export function scheduleMailerLite(log = console) {
  if (!enabled()) return null;
  let busy = false;
  const run = async () => {
    if (busy) return; busy = true;
    try { await syncAll({ log }); } catch (e) { log.error?.({ err: e }, "mailerlite sync failed"); }
    finally { busy = false; }
  };
  setTimeout(run, 180_000);
  return setInterval(run, 6 * 3600e3);
}

