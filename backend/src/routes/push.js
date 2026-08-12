import { prisma } from "../db.js";
import { config } from "../config.js";
import { getCurrentUser } from "../auth/current-user.js";

export default async function pushRoutes(app) {
  const auth = async (req, reply) => {
    const u = await getCurrentUser(req);
    if (!u) { reply.code(401).send({ error: "sign in first" }); return; }
    req.user = u;
  };

  // Public: the frontend needs the VAPID public key to subscribe.
  app.get("/push/config", async () => ({
    publicKey: config.vapid.publicKey,
    configured: config.vapid.configured,
  }));

  // Store (or refresh) a Web Push subscription. Idempotent on endpoint.
  app.post("/push/subscribe", { preHandler: auth }, async (req, reply) => {
    const s = req.body || {};
    const endpoint = s.endpoint, p256dh = s.keys?.p256dh, authKey = s.keys?.auth;
    if (!endpoint || !p256dh || !authKey) return reply.code(400).send({ error: "invalid subscription" });
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { userId: req.user.id, endpoint, p256dh, auth: authKey },
      update: { userId: req.user.id, p256dh, auth: authKey },
    });
    return { ok: true };
  });

  app.post("/push/unsubscribe", { preHandler: auth }, async (req) => {
    const endpoint = req.body?.endpoint;
    if (endpoint) await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: req.user.id } });
    return { ok: true };
  });
}
