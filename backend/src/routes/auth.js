import { prisma } from "../db.js";
import { config } from "../config.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { createSession, invalidateSession } from "../auth/session.js";
import { getCurrentUser } from "../auth/current-user.js";

function setSessionCookie(reply, token, expiresAt) {
  reply.setCookie(config.cookieName, token, {
    httpOnly: true, sameSite: "lax", secure: config.isProd, path: "/", expires: expiresAt,
  });
}
const publicUser = (u) => ({ id: u.id, email: u.email, emailVerified: u.emailVerified });

export default async function authRoutes(app) {
  app.post("/auth/signup", async (req, reply) => {
    const { email, password } = req.body || {};
    if (!email || !password || password.length < 8)
      return reply.code(400).send({ error: "email and 8+ char password required" });
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return reply.code(409).send({ error: "email already registered" });
    const user = await prisma.user.create({ data: { email, passwordHash: await hashPassword(password) } });
    const { token, expiresAt } = await createSession(user.id);
    setSessionCookie(reply, token, expiresAt);
    return { user: publicUser(user) };
  });

  app.post("/auth/login", async (req, reply) => {
    const { email, password } = req.body || {};
    const user = email ? await prisma.user.findUnique({ where: { email } }) : null;
    if (!user || !user.passwordHash || !(await verifyPassword(password || "", user.passwordHash)))
      return reply.code(401).send({ error: "invalid credentials" });
    const { token, expiresAt } = await createSession(user.id);
    setSessionCookie(reply, token, expiresAt);
    return { user: publicUser(user) };
  });

  app.post("/auth/logout", async (req, reply) => {
    await invalidateSession(req.cookies?.[config.cookieName]);
    reply.clearCookie(config.cookieName, { path: "/" });
    return { ok: true };
  });

  app.get("/auth/me", async (req) => {
    const user = await getCurrentUser(req);
    return { user: user ? publicUser(user) : null };
  });
}
