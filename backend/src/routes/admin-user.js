import { prisma } from "../db.js";
import { getCurrentUser } from "../auth/current-user.js";
import { isAdmin } from "../social/moderation.js";
import { entitlementForUser } from "../billing/user-entitlement.js";
import { getStripe } from "../billing/stripe.js";

async function findTarget(q) {
  const where = q.id ? { id: String(q.id) } : q.email ? { email: String(q.email).trim().toLowerCase() } : null;
  if (!where) return null;
  return prisma.user.findFirst({ where });
}

export default async function adminUserRoutes(app) {
  // Full customer profile: account, membership, acquisition, device, behaviour.
  app.get("/api/admin/user", async (req, reply) => {
    const me = await getCurrentUser(req);
    if (!isAdmin(me)) return reply.code(403).send({ error: "forbidden" });
    const u = await findTarget(req.query || {});
    if (!u) return reply.code(404).send({ error: "user not found" });

    const [sub, entitlement, events, byType, topReaches, catches, notes, posts, comments, saved] = await Promise.all([
      prisma.subscription.findUnique({ where: { userId: u.id } }),
      entitlementForUser(u.id),
      prisma.event.findMany({ where: { userId: u.id }, orderBy: { createdAt: "desc" }, take: 80 }),
      prisma.event.groupBy({ by: ["type"], where: { userId: u.id }, _count: { _all: true } }),
      prisma.event.groupBy({ by: ["ref"], where: { userId: u.id, type: "view_reach", ref: { not: null } }, _count: { _all: true } }),
      prisma.catch.count({ where: { userId: u.id } }),
      prisma.note.count({ where: { userId: u.id, deletedAt: null } }),
      prisma.post.count({ where: { userId: u.id, deletedAt: null } }),
      prisma.comment.count({ where: { userId: u.id, deletedAt: null } }),
      prisma.savedSpot.count({ where: { userId: u.id } }),
    ]);

    // Acquisition/device come from the user-linked "acquisition" event (first-touch,
    // sent once the visitor signs in). Fall back to null if none recorded.
    const acqEvent = events.filter((e) => e.type === "acquisition").sort((a, b) => a.createdAt - b.createdAt)[0];
    const acq = acqEvent?.meta || null;

    return {
      user: { id: u.id, email: u.email, displayName: u.displayName || null, avatarUrl: u.avatarUrl || null,
        emailVerified: u.emailVerified, isAdmin: isAdmin(u), createdAt: u.createdAt.toISOString(),
        provider: u.googleId ? "google" : u.passwordHash ? "email" : "other" },
      membership: {
        entitlement,
        status: sub?.status || null,
        priceId: sub?.priceId || null,
        currentPeriodEnd: sub?.currentPeriodEnd ? sub.currentPeriodEnd.toISOString() : null,
        stripeCustomerId: u.stripeCustomerId || null,
      },
      acquisition: acq && {
        source: acq.source || null,
        referrer: acq.referrer || null,
        landing: acq.landing || null,
        utmSource: acq.utmSource || null, utmMedium: acq.utmMedium || null, utmCampaign: acq.utmCampaign || null,
        device: acq.device || null,
        firstSeen: acqEvent.createdAt.toISOString(),
      },
      behaviour: {
        byType: byType.map((r) => ({ type: r.type, count: r._count._all })).sort((a, b) => b.count - a.count),
        topReaches: topReaches.map((r) => ({ ref: r.ref, count: r._count._all })).sort((a, b) => b.count - a.count).slice(0, 12),
      },
      content: { catches, notes, posts, comments, saved },
      recentActivity: events.slice(0, 60).map((e) => ({
        type: e.type, ref: e.ref, createdAt: e.createdAt.toISOString(),
        meta: ["visit", "acquisition", "landing"].includes(e.type) ? e.meta : undefined,
      })),
    };
  });

  // Hard-delete a customer and ALL their data (GDPR-style erase).
  app.delete("/api/admin/user", async (req, reply) => {
    const me = await getCurrentUser(req);
    if (!isAdmin(me)) return reply.code(403).send({ error: "forbidden" });
    const u = await findTarget(req.query || {});
    if (!u) return reply.code(404).send({ error: "user not found" });
    if (isAdmin(u)) return reply.code(400).send({ error: "refusing to delete the admin account" });

    // Best-effort: cancel any live Stripe subscription so they aren't billed.
    const sub = await prisma.subscription.findUnique({ where: { userId: u.id } });
    if (sub?.id) { try { await getStripe().subscriptions.cancel(sub.id); } catch { /* already gone/invalid */ } }

    // Events have no FK cascade, and notifications the user authored (as actor)
    // live on other users' rows — remove both explicitly.
    await prisma.event.deleteMany({ where: { userId: u.id } });
    await prisma.notification.deleteMany({ where: { actorId: u.id } });
    // Everything else cascades from the User row.
    await prisma.user.delete({ where: { id: u.id } });
    return { ok: true, deleted: u.email };
  });
}
