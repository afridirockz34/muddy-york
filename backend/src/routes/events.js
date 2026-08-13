import { prisma } from "../db.js";
import { getCurrentUser } from "../auth/current-user.js";

// Lightweight usage telemetry: the client batches interaction events and posts
// them here. Anonymous is fine (userId is null when signed out). This data both
// records how the app is used and drives the "trending reaches" signal.
export default async function eventRoutes(app) {
  app.post("/api/events", async (req) => {
    const me = await getCurrentUser(req);
    const list = Array.isArray(req.body?.events) ? req.body.events.slice(0, 50) : [];
    const data = list
      .filter((e) => e && typeof e.type === "string")
      .map((e) => ({
        userId: me?.id || null,
        type: String(e.type).slice(0, 40),
        ref: e.ref ? String(e.ref).slice(0, 60) : null,
        meta: e.meta && typeof e.meta === "object" ? e.meta : undefined,
      }));
    if (data.length) await prisma.event.createMany({ data }).catch(() => {});
    return { ok: true, stored: data.length };
  });

  // Per-reach community interest over the last 21 days (views + saves), scored
  // 0..1 relative to the busiest reach. Public; anonymized (counts only).
  app.get("/api/reach-trending", async () => {
    const since = new Date(Date.now() - 21 * 86400000);
    const rows = await prisma.event.groupBy({
      by: ["ref"],
      where: { createdAt: { gte: since }, type: { in: ["view_reach", "save"] }, ref: { not: null } },
      _count: { _all: true },
    });
    const counts = {};
    for (const r of rows) counts[r.ref] = r._count._all;
    const max = Math.max(1, ...Object.values(counts));
    const trending = {};
    for (const ref of Object.keys(counts)) trending[ref] = { views: counts[ref], score: +(counts[ref] / max).toFixed(2) };
    return { trending };
  });
}
