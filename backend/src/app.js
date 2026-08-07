import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import { config } from "./config.js";
import authRoutes from "./routes/auth.js";
import googleRoutes from "./routes/google.js";
import billingRoutes from "./routes/billing.js";
import stripeWebhookRoutes from "./routes/stripe-webhook.js";
import { requirePremium } from "./billing/require-premium.js";

export function buildApp() {
  const app = Fastify({ logger: true });
  app.register(cors, { origin: config.frontendOrigin, credentials: true });
  app.register(cookie);
  app.register(rateLimit, { max: 100, timeWindow: "1 minute" });
  app.register(stripeWebhookRoutes);
  app.register(authRoutes);
  app.register(googleRoutes);
  app.register(billingRoutes);
  app.get("/health", async () => ({ ok: true }));
  app.get("/premium/ping", { preHandler: requirePremium }, async () => ({ ok: true, premium: true }));
  return app;
}
