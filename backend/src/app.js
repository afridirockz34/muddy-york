import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import { config } from "./config.js";
import authRoutes from "./routes/auth.js";
import googleRoutes from "./routes/google.js";
import appleRoutes from "./routes/apple.js";
import billingRoutes from "./routes/billing.js";
import savedRoutes from "./routes/saved.js";
import catchRoutes from "./routes/catches.js";
import eventRoutes from "./routes/events.js";
import adminRoutes from "./routes/admin.js";
import noteRoutes from "./routes/notes.js";
import postRoutes from "./routes/posts.js";
import pushRoutes from "./routes/push.js";
import stripeWebhookRoutes from "./routes/stripe-webhook.js";
import proxyRoutes from "./routes/proxy.js";
import { requirePremium } from "./billing/require-premium.js";

export function buildApp(opts = {}) {
  const app = Fastify({ logger: true });
  app.register(cors, { origin: config.frontendOrigin, credentials: true });
  app.register(cookie);
  app.register(rateLimit, { max: 100, timeWindow: "1 minute" });
  app.register(stripeWebhookRoutes);
  app.register(authRoutes);
  app.register(googleRoutes);
  app.register(appleRoutes);
  app.register(billingRoutes);
  app.register(savedRoutes);
  app.register(catchRoutes);
  app.register(eventRoutes);
  app.register(adminRoutes);
  app.register(noteRoutes);
  app.register(postRoutes);
  app.register(pushRoutes);
  app.register(proxyRoutes(opts.proxyFetch));
  app.get("/health", async () => ({ ok: true }));
  app.get("/premium/ping", { preHandler: requirePremium }, async () => ({ ok: true, premium: true }));

  // Thrown/unhandled errors otherwise emit `Access-Control-Allow-Origin: *`,
  // which browsers reject on credentialed requests. Force the real origin so
  // error responses are readable by the frontend instead of "Failed to fetch".
  app.setErrorHandler((err, req, reply) => {
    if (req.headers.origin && req.headers.origin === config.frontendOrigin) {
      reply.header("access-control-allow-origin", config.frontendOrigin);
      reply.header("access-control-allow-credentials", "true");
      reply.header("vary", "Origin");
    }
    const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
    req.log.error(err);
    reply.code(status).send({ error: err.message || "Internal Server Error" });
  });
  return app;
}
