import { randomBytes, createHash } from "node:crypto";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { createSession, invalidateSession } from "../auth/session.js";
import { getCurrentUser } from "../auth/current-user.js";
import { entitlementForUser } from "../billing/user-entitlement.js";
import { isAdmin } from "../social/moderation.js";
import { sendMail } from "../alerts/mailer.js";

const sha256 = (s) => createHash("sha256").update(s).digest("hex");

function setSessionCookie(reply, token, expiresAt) {
  reply.setCookie(config.cookieName, token, {
    httpOnly: true, sameSite: config.isProd ? "none" : "lax", secure: config.isProd, path: "/", expires: expiresAt,
  });
}
const publicUser = (u) => ({ id: u.id, email: u.email, emailVerified: u.emailVerified, displayName: u.displayName || null, avatarUrl: u.avatarUrl || null });

// Case-insensitive username availability. Optionally exclude one user (for edits).
export async function isNameTaken(name, exceptUserId) {
  const clash = await prisma.user.findFirst({
    where: { displayName: { equals: name, mode: "insensitive" }, ...(exceptUserId ? { id: { not: exceptUserId } } : {}) },
    select: { id: true },
  });
  return !!clash;
}

export default async function authRoutes(app) {
  app.post("/auth/signup", async (req, reply) => {
    const { email, password } = req.body || {};
    const displayName = String(req.body?.displayName || "").trim();
    if (!email || !password || password.length < 8)
      return reply.code(400).send({ error: "email and 8+ char password required" });
    if (displayName.length < 2 || displayName.length > 40)
      return reply.code(400).send({ error: "username must be 2–40 characters" });
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return reply.code(409).send({ error: "email already registered" });
    if (await isNameTaken(displayName)) return reply.code(409).send({ error: "username taken" });
    // No no-card trial: the 14-day trial starts only after checkout with a card.
    let user;
    try {
      user = await prisma.user.create({ data: { email, passwordHash: await hashPassword(password), displayName } });
    } catch (e) {
      // Unique race on email or (if a DB constraint exists) username.
      return reply.code(409).send({ error: "email or username already taken" });
    }
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
    // Must clear with the SAME attributes the cookie was set with, or Safari
    // (SameSite=None; Secure) silently keeps it and the user stays "signed in".
    reply.clearCookie(config.cookieName, {
      path: "/", httpOnly: true,
      sameSite: config.isProd ? "none" : "lax", secure: config.isProd,
    });
    return { ok: true };
  });

  // Request a password reset. Always returns ok (never reveals whether the email
  // exists). Emails a link to FRONTEND_ORIGIN/?reset=<token> when an email account
  // is found.
  app.post("/auth/forgot", async (req) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (email) {
      const user = await prisma.user.findUnique({ where: { email } });
      if (user && user.passwordHash) {
        const token = randomBytes(32).toString("hex");
        await prisma.user.update({
          where: { id: user.id },
          data: { resetTokenHash: sha256(token), resetTokenExp: new Date(Date.now() + 60 * 60 * 1000) },
        });
        const link = `${config.frontendOrigin}/?reset=${token}`;
        await sendMail({
          to: user.email,
          subject: "Reset your Muddy York Fishing password",
          text: `Tap the link to set a new password (valid for 1 hour):\n\n${link}\n\nIf you didn't request this, you can ignore this email.`,
        }).catch(() => {});
      }
    }
    return { ok: true };
  });

  // Complete a reset with a valid, unexpired token.
  app.post("/auth/reset", async (req, reply) => {
    const token = String(req.body?.token || "");
    const password = String(req.body?.password || "");
    if (!token || password.length < 8) return reply.code(400).send({ error: "valid token and 8+ char password required" });
    const user = await prisma.user.findFirst({ where: { resetTokenHash: sha256(token), resetTokenExp: { gt: new Date() } } });
    if (!user) return reply.code(400).send({ error: "this reset link is invalid or has expired" });
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(password), resetTokenHash: null, resetTokenExp: null },
    });
    // Sign the user in immediately.
    const { token: sess, expiresAt } = await createSession(user.id);
    setSessionCookie(reply, sess, expiresAt);
    return { user: publicUser(user) };
  });

  // Which sign-in providers are available (drives the sign-in gate buttons).
  app.get("/auth/providers", async () => ({
    google: !!config.google.clientId,
    apple: config.apple.configured,
  }));

  app.get("/auth/me", async (req) => {
    const user = await getCurrentUser(req);
    if (!user) return { user: null, entitlement: "free" };
    return { user: publicUser(user), entitlement: await entitlementForUser(user.id), isAdmin: isAdmin(user) };
  });
}
