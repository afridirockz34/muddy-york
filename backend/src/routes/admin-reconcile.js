import { prisma } from "../db.js";
import { getCurrentUser } from "../auth/current-user.js";
import { isAdmin } from "../social/moderation.js";
import { getStripe } from "../billing/stripe.js";
import { periodEndOf } from "./stripe-webhook.js";
import { resolveEntitlement } from "../billing/entitlement.js";

// Of a customer's subscriptions, pick the one that best represents their access.
function pickSub(subs) {
  const rank = (s) => ({ active: 4, trialing: 3, past_due: 2 }[s.status] ?? 1);
  return [...subs].sort((a, b) => rank(b) - rank(a) || (b.created || 0) - (a.created || 0))[0] || null;
}

// Admin-only: re-sync local subscription rows from the live Stripe truth. Fixes
// any member whose local row drifted (e.g. a webhook that failed before these
// bug fixes). POST with { email } to reconcile one member, or no body for all
// members with a Stripe customer.
export default async function adminReconcileRoutes(app) {
  app.post("/api/admin/reconcile", async (req, reply) => {
    const me = await getCurrentUser(req);
    if (!isAdmin(me)) return reply.code(403).send({ error: "forbidden" });
    const email = req.body?.email ? String(req.body.email).trim().toLowerCase() : null;

    const users = await prisma.user.findMany({
      where: { stripeCustomerId: { not: null }, ...(email ? { email } : {}) },
      select: { id: true, email: true, stripeCustomerId: true },
    });
    if (email && users.length === 0) return reply.code(404).send({ error: "no member with a Stripe customer for that email" });

    const results = [];
    for (const u of users) {
      try {
        const list = await getStripe().subscriptions.list({ customer: u.stripeCustomerId, status: "all", limit: 20 });
        const sub = pickSub(list.data);
        if (!sub) {
          await prisma.subscription.deleteMany({ where: { userId: u.id } });
          results.push({ email: u.email, action: "cleared", status: null, entitlement: "free" });
          continue;
        }
        const cpe = periodEndOf(sub);
        const data = {
          id: sub.id,
          status: sub.status,
          priceId: sub.items?.data?.[0]?.price?.id || null,
          currentPeriodEnd: cpe ? new Date(cpe * 1000) : null,
        };
        await prisma.subscription.upsert({ where: { userId: u.id }, create: { userId: u.id, ...data }, update: data });
        const entitlement = resolveEntitlement({ status: data.status, currentPeriodEnd: data.currentPeriodEnd, trialEnd: null });
        results.push({ email: u.email, action: "synced", status: sub.status, entitlement });
      } catch (e) {
        results.push({ email: u.email, action: "error", error: e?.raw?.message || e?.message || "failed" });
      }
    }
    return { reconciled: results.length, results };
  });
}
