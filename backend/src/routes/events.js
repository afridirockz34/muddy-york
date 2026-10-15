import { prisma } from "../db.js";
import { getCurrentUser } from "../auth/current-user.js";

// Crawlers and headless browsers that run page scripts. Their events are noise.
const BOT_UA = /bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|embedly|python|curl|wget/i;
const ID = /^[A-Za-z0-9_-]{8,40}$/;
const cleanId = (v) => (typeof v === "string" && ID.test(v) ? v : null);

// Usage telemetry: the website and the app batch interaction events and post
// them here. Anonymous is fine (userId is null when signed out); visitorId and
// sessionId tie one browser's page views, clicks and app screens together.
// This data records how the site and app are used and drives the "trending
// reaches" signal.
export default async function eventRoutes(app) {
  app.post("/api/events", async (req) => {
    if (BOT_UA.test(req.headers["user-agent"] || "")) return { ok: true, stored: 0 };
    const me = await getCurrentUser(req);
    const visitorId = cleanId(req.body?.visitorId);
    const sessionId = cleanId(req.body?.sessionId);
    const list = Array.isArray(req.body?.events) ? req.body.events.slice(0, 50) : [];
    const data = list
      .filter((e) => e && typeof e.type === "string")
      .map((e) => ({
        userId: me?.id || null,
        visitorId,
        sessionId,
        type: String(e.type).slice(0, 40),
        ref: e.ref ? String(e.ref).slice(0, 120) : null,
        meta: e.meta && typeof e.meta === "object" && JSON.stringify(e.meta).length < 4000 ? e.meta : undefined,
      }));
    if (data.length) await prisma.event.createMany({ data }).catch(() => {});
    // Once a visitor signs in, their earlier anonymous visits become theirs too,
    // so the admin sees the whole path from first page to membership.
    if (me && visitorId) {
      await prisma.event.updateMany({ where: { visitorId, userId: null }, data: { userId: me.id } }).catch(() => {});
    }
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
