import { prisma } from "../db.js";
import { config } from "../config.js";

// Conversions sent to Google Analytics from the server (Measurement Protocol),
// so ad blockers and abandoned return trips don't lose them. Joined to the
// visitor's session by the Analytics browser id saved at checkout.
// Off unless GA4_MEASUREMENT_ID and GA4_API_SECRET are set (Render).
export const enabled = () => !!(process.env.GA4_MEASUREMENT_ID && process.env.GA4_API_SECRET);

// The _ga cookie ("GA1.1.123456789.1700000000") holds the client id as its
// last two parts.
export function clientIdFromCookie(v) {
  const m = /^GA\d\.\d+\.(\d+\.\d+)$/.exec(String(v || "").trim());
  return m ? m[1] : null;
}

// The page that first brought this member in, from our own analytics.
async function landingOf(userId) {
  const e = await prisma.event.findFirst({ where: { userId, type: "acquisition" }, orderBy: { createdAt: "asc" } }).catch(() => null);
  return (e && e.meta && (e.meta.landing || e.meta.landingPage)) || null;
}

export function planOfPrice(priceId) {
  if (priceId && priceId === config.stripe.priceAnnual) return "yearly";
  if (priceId && priceId === config.stripe.priceMonthly) return "monthly";
  return null;
}

export async function sendGa4(user, name, params = {}, { fetchImpl = fetch, log = console } = {}) {
  if (!enabled() || !user) return false;
  // Without a browser id the event can't join a visit; it still counts, under
  // a stable id for this member.
  const clientId = user.gaClientId || `${parseInt(String(user.id).replace(/[^0-9a-f]/gi, "").slice(0, 8) || "1", 16)}.1`;
  const landing = await landingOf(user.id);
  const body = { client_id: clientId, events: [{ name, params: { ...params, ...(landing ? { landing_page: landing.slice(0, 100) } : {}), engagement_time_msec: 1 } }] };
  const url = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(process.env.GA4_MEASUREMENT_ID)}&api_secret=${encodeURIComponent(process.env.GA4_API_SECRET)}`;
  try {
    const r = await fetchImpl(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return r.ok || r.status === 204;
  } catch (e) { log.warn?.({ err: e && e.message }, "ga4 send failed"); return false; }
}
