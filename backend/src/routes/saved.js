import { prisma } from "../db.js";
import { getCurrentUser } from "../auth/current-user.js";

export default async function savedRoutes(app) {
  const auth = async (req, reply) => {
    const user = await getCurrentUser(req);
    if (!user) { reply.code(401).send({ error: "not authenticated" }); return; }
    req.user = user;
  };

  app.get("/saved-spots", { preHandler: auth }, async (req) => {
    const spots = await prisma.savedSpot.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: "desc" } });
    return { spots };
  });

  app.post("/saved-spots", { preHandler: auth }, async (req, reply) => {
    const b = req.body || {};
    if (!b.ref || b.lat == null || b.lon == null) return reply.code(400).send({ error: "ref, lat, lon required" });
    const data = { river: b.river || "", section: b.section || "", lat: b.lat, lon: b.lon,
      source: b.source || "verified", habitat: b.habitat || {}, species: b.species || [], history: b.history ?? 60 };
    const spot = await prisma.savedSpot.upsert({
      where: { userId_ref: { userId: req.user.id, ref: b.ref } },
      create: { userId: req.user.id, ref: b.ref, ...data },
      update: data,
    });
    return { spot };
  });

  app.delete("/saved-spots/:ref", { preHandler: auth }, async (req) => {
    await prisma.savedSpot.deleteMany({ where: { userId: req.user.id, ref: req.params.ref } });
    return { ok: true };
  });

  app.get("/alert-prefs", { preHandler: auth }, async (req) => {
    return { alertEmail: req.user.alertEmail, alertThreshold: req.user.alertThreshold };
  });

  app.put("/alert-prefs", { preHandler: auth }, async (req) => {
    const b = req.body || {};
    const user = await prisma.user.update({ where: { id: req.user.id },
      data: { alertEmail: typeof b.alertEmail === "boolean" ? b.alertEmail : req.user.alertEmail,
        alertThreshold: Number.isInteger(b.alertThreshold) ? b.alertThreshold : req.user.alertThreshold } });
    return { alertEmail: user.alertEmail, alertThreshold: user.alertThreshold };
  });
}
