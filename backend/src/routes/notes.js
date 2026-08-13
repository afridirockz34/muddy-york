import { prisma } from "../db.js";
import { getCurrentUser } from "../auth/current-user.js";

// Private per-user notes with cloud-sync (Phase D). Notes are immutable except
// delete; deletes are tombstones (deletedAt) so removals propagate across a
// user's devices instead of resurrecting from another device's copy.
function publicNote(n) {
  return {
    id: n.id, title: n.title, body: n.body, technique: n.technique, flies: n.flies,
    species: n.species, size: n.size, lat: n.lat, lon: n.lon, ref: n.ref || null,
    createdAt: n.createdAt.toISOString(),
  };
}

export default async function noteRoutes(app) {
  const auth = async (req, reply) => {
    const u = await getCurrentUser(req);
    if (!u) { reply.code(401).send({ error: "sign in to sync notes" }); return; }
    req.user = u;
  };

  // Upsert by client-generated id, scoped to the user. Idempotent: re-pushing an
  // existing note is a no-op update. Never revives a note the user has deleted.
  app.post("/notes", { preHandler: auth }, async (req, reply) => {
    const b = req.body || {};
    if (!b.id) return reply.code(400).send({ error: "id required" });
    const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    const data = {
      title: String(b.title || ""), body: String(b.body || ""),
      technique: String(b.technique || ""), flies: String(b.flies || ""),
      species: String(b.species || ""), size: String(b.size || ""),
      lat: num(b.lat), lon: num(b.lon),
      ref: b.ref ? String(b.ref).slice(0, 60) : null,
      createdAt: b.createdAt ? new Date(b.createdAt) : new Date(),
    };
    // Check ownership BEFORE writing — an id is a global PK, so a blind upsert
    // could clobber another user's row. A different owner is forbidden.
    const existing = await prisma.note.findUnique({ where: { id: String(b.id) } });
    if (existing && existing.userId !== req.user.id) return reply.code(403).send({ error: "forbidden" });
    if (existing && existing.deletedAt) return { note: publicNote(existing), deleted: true };
    const n = existing
      ? await prisma.note.update({ where: { id: existing.id }, data })
      : await prisma.note.create({ data: { id: String(b.id), userId: req.user.id, ...data } });
    return { note: publicNote(n) };
  });

  // Tombstone. Idempotent (200 even if unknown/already-deleted) so offline
  // retries are safe. Only ever affects the caller's own note.
  app.delete("/notes/:id", { preHandler: auth }, async (req) => {
    await prisma.note.updateMany({
      where: { id: req.params.id, userId: req.user.id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return { ok: true };
  });

  // Changed rows since a cursor. Returns live notes + tombstoned ids, and echoes
  // serverTime for the client to use as the next cursor (avoids clock skew).
  app.get("/notes", { preHandler: auth }, async (req) => {
    const since = req.query?.since ? new Date(req.query.since) : null;
    const where = { userId: req.user.id };
    if (since && !Number.isNaN(since.getTime())) where.updatedAt = { gt: since };
    const rows = await prisma.note.findMany({ where, orderBy: { createdAt: "desc" }, take: 500 });
    const notes = rows.filter((n) => !n.deletedAt).map(publicNote);
    const deleted = rows.filter((n) => n.deletedAt).map((n) => n.id);
    return { notes, deleted, serverTime: new Date().toISOString() };
  });
}
