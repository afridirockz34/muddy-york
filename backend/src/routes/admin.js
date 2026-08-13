import { prisma } from "../db.js";
import { getCurrentUser } from "../auth/current-user.js";
import { isAdmin } from "../social/moderation.js";

// Admin-only business overview. Gated on ADMIN_EMAIL — a non-admin gets 403.
export default async function adminRoutes(app) {
  app.get("/api/admin/overview", async (req, reply) => {
    const me = await getCurrentUser(req);
    if (!isAdmin(me)) return reply.code(403).send({ error: "forbidden" });
    const now = Date.now();
    const d7 = new Date(now - 7 * 86400000);
    const d30 = new Date(now - 30 * 86400000);
    const [
      users, new7d, new30d, active, trialing,
      catches, notes, posts, comments, events7d,
      recentUsers, recentCatches, eventTypes,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: d7 } } }),
      prisma.user.count({ where: { createdAt: { gte: d30 } } }),
      prisma.subscription.count({ where: { status: "active" } }),
      prisma.subscription.count({ where: { status: "trialing" } }),
      prisma.catch.count(),
      prisma.note.count({ where: { deletedAt: null } }),
      prisma.post.count({ where: { deletedAt: null } }),
      prisma.comment.count({ where: { deletedAt: null } }),
      prisma.event.count({ where: { createdAt: { gte: d7 } } }),
      prisma.user.findMany({ orderBy: { createdAt: "desc" }, take: 15, select: { email: true, displayName: true, createdAt: true } }),
      prisma.catch.findMany({ orderBy: { caughtAt: "desc" }, take: 10, select: { species: true, sizeInches: true, river: true, caughtAt: true } }),
      prisma.event.groupBy({ by: ["type"], where: { createdAt: { gte: d30 } }, _count: { _all: true } }),
    ]);
    return {
      users: { total: users, new7d, new30d },
      members: { active, trialing },
      content: { catches, notes, posts, comments },
      events7d,
      topEvents: eventTypes.map((e) => ({ type: e.type, count: e._count._all })).sort((a, b) => b.count - a.count),
      recentSignups: recentUsers.map((u) => ({ email: u.email, displayName: u.displayName, createdAt: u.createdAt.toISOString() })),
      recentCatches: recentCatches.map((c) => ({ species: c.species, sizeInches: c.sizeInches, river: c.river, caughtAt: c.caughtAt.toISOString() })),
    };
  });
}
