import { prisma } from "../db.js";
import { getCurrentUser } from "../auth/current-user.js";
import { momentumFrom } from "../../../lib/catch-nudge.js";
import { reachActivity } from "../../../lib/reach-activity.js";

export default async function catchRoutes(app) {
  const auth = async (req, reply) => {
    const u = await getCurrentUser(req);
    if (!u) { reply.code(401).send({ error: "sign in to log a catch" }); return; }
    req.user = u;
  };

  app.post("/catches", { preHandler: auth }, async (req, reply) => {
    const b = req.body || {};
    if (!b.ref || !b.species) return reply.code(400).send({ error: "ref and species required" });
    const size = b.sizeInches != null ? Math.max(0, Math.min(80, +b.sizeInches)) : null;
    const c = await prisma.catch.create({ data: {
      userId: req.user.id, ref: String(b.ref), river: b.river || "", section: b.section || "",
      species: String(b.species), sizeInches: Number.isFinite(size) ? size : null,
      technique: b.technique || null, flies: b.flies || null,
    }});
    return { catch: { id: c.id, ref: c.ref, species: c.species, sizeInches: c.sizeInches, caughtAt: c.caughtAt } };
  });

  app.get("/catches", { preHandler: auth }, async (req) => {
    const catches = await prisma.catch.findMany({ where: { userId: req.user.id }, orderBy: { caughtAt: "desc" }, take: 200 });
    return { catches };
  });

  app.delete("/catches/:id", { preHandler: auth }, async (req) => {
    await prisma.catch.deleteMany({ where: { id: req.params.id, userId: req.user.id } });
    return { ok: true };
  });

  app.get("/api/catch-activity", async () => {
    const since = new Date(Date.now() - 90 * 86400000);
    const rows = await prisma.catch.findMany({ where: { caughtAt: { gte: since } }, select: { ref: true, caughtAt: true } });
    const byRef = {};
    for (const r of rows) (byRef[r.ref] ||= []).push(r.caughtAt.toISOString());
    const now = new Date(), cutoff30 = Date.now() - 30 * 86400000;
    const activity = {};
    for (const ref of Object.keys(byRef)) {
      const dates = byRef[ref];
      activity[ref] = {
        count30d: dates.filter((d) => new Date(d).getTime() >= cutoff30).length,
        lastDays: Math.round((now.getTime() - Math.max(...dates.map((d) => new Date(d).getTime()))) / 86400000),
        momentum: +momentumFrom(dates, now).toFixed(3),
      };
    }
    return { activity };
  });

  // Enriched per-reach intelligence from customer logs (catches + note pins):
  // recent activity/momentum that boosts the opportunity score, plus the species
  // and sizes actually being logged, which sharpen the fish estimate.
  app.get("/api/reach-activity", async () => {
    const since = new Date(Date.now() - 90 * 86400000);
    const [catches, notes] = await Promise.all([
      prisma.catch.findMany({ where: { caughtAt: { gte: since } }, select: { ref: true, species: true, sizeInches: true, caughtAt: true } }),
      prisma.note.findMany({ where: { deletedAt: null, ref: { not: null }, createdAt: { gte: since } }, select: { ref: true, species: true, createdAt: true } }),
    ]);
    return { activity: reachActivity({ catches, notes }) };
  });

  // Anonymized leaderboard: the biggest recent catches by reach. No angler
  // identity or exact location — keeps the reach-level privacy model.
  app.get("/api/catch-leaderboard", async () => {
    const since = new Date(Date.now() - 60 * 86400000);
    const rows = await prisma.catch.findMany({
      where: { caughtAt: { gte: since }, sizeInches: { not: null } },
      orderBy: { sizeInches: "desc" }, take: 20,
      select: { species: true, sizeInches: true, river: true, section: true, caughtAt: true },
    });
    const now = Date.now();
    return {
      catches: rows.map((r) => ({
        species: r.species, sizeInches: r.sizeInches, river: r.river, section: r.section,
        daysAgo: Math.round((now - r.caughtAt.getTime()) / 86400000),
      })),
    };
  });
}
