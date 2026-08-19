import { Apple, generateState } from "arctic";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { createSession } from "../auth/session.js";
import { decodeIdToken } from "./google.js";

// Sign in with Apple. Inactive until the APPLE_* env vars are configured;
// the sign-in gate only shows the Apple button when /auth/providers reports it.
function client() {
  return new Apple(config.apple.clientId, config.apple.teamId, config.apple.keyId, config.apple.privateKey, config.apple.redirectUri);
}
const oauthCookie = { httpOnly: true, sameSite: "none", secure: config.isProd, path: "/", maxAge: 600 };

function setSessionCookie(reply, token, expiresAt) {
  reply.setCookie(config.cookieName, token, {
    httpOnly: true, sameSite: config.isProd ? "none" : "lax", secure: config.isProd, path: "/", expires: expiresAt,
  });
}

export default async function appleRoutes(app) {
  // Apple's form_post callback arrives as application/x-www-form-urlencoded.
  app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (req, body, done) => {
    const obj = {}; for (const [k, v] of new URLSearchParams(body)) obj[k] = v; done(null, obj);
  });

  app.get("/auth/apple", async (req, reply) => {
    if (!config.apple.configured) return reply.code(503).send({ error: "apple sign-in not configured" });
    const state = generateState();
    const url = client().createAuthorizationURL(state, ["name", "email"]);
    url.searchParams.set("response_mode", "form_post"); // Apple posts the result back
    reply.setCookie("a_state", state, oauthCookie);
    return reply.redirect(url.toString());
  });

  // Apple posts the authorization result (form_post). Also carries `user` JSON
  // with name/email only on the very first authorization.
  app.post("/auth/apple/callback", async (req, reply) => {
    if (!config.apple.configured) return reply.code(503).send({ error: "apple sign-in not configured" });
    const b = req.body || {};
    if (!b.code || !b.state || b.state !== req.cookies?.a_state) return reply.code(400).send({ error: "invalid apple callback" });
    let email, sub;
    try {
      const tokens = await client().validateAuthorizationCode(b.code);
      const claims = decodeIdToken(tokens.idToken());
      sub = claims.sub;
      email = claims.email || (b.user ? JSON.parse(b.user).email : null);
    } catch {
      return reply.code(400).send({ error: "apple token exchange failed" });
    }
    if (!sub) return reply.code(400).send({ error: "no apple identity" });
    const appleId = "apple:" + sub;
    let user = await prisma.user.findFirst({ where: { OR: [{ googleId: appleId }, ...(email ? [{ email }] : [])] } });
    if (!user) user = await prisma.user.create({ data: { email: email || `${sub}@appleid.local`, googleId: appleId, emailVerified: true } });
    const { token, expiresAt } = await createSession(user.id);
    setSessionCookie(reply, token, expiresAt);
    return reply.redirect(config.frontendOrigin + "/?signed_in=apple");
  });
}
