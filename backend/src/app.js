import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import { config } from "./config.js";
import authRoutes from "./routes/auth.js";
import googleRoutes from "./routes/google.js";

export function buildApp() {
  const app = Fastify({ logger: true });
  app.register(cors, { origin: config.frontendOrigin, credentials: true });
  app.register(cookie);
  app.register(rateLimit, { max: 100, timeWindow: "1 minute" });
  app.register(authRoutes);
  app.register(googleRoutes);
  app.get("/health", async () => ({ ok: true }));
  return app;
}
