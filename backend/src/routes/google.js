import { Google, generateState, generateCodeVerifier } from "arctic";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { createSession } from "../auth/session.js";

function client() {
  return new Google(config.google.clientId, config.google.clientSecret, config.google.redirectUri);
}
const oauthCookie = { httpOnly: true, sameSite: config.isProd ? "none" : "lax", secure: config.isProd, path: "/", maxAge: 600 };

export function decodeIdToken(jwt) {
  const payload = jwt.split(".")[1];
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}

export default async function googleRoutes(app) {
  app.get("/auth/google", async (req, reply) => {
    const state = generateState();
    const verifier = generateCodeVerifier();
    const url = client().createAuthorizationURL(state, verifier, ["openid", "email"]);
    reply.setCookie("g_state", state, oauthCookie);
    reply.setCookie("g_verifier", verifier, oauthCookie);
    return reply.redirect(url.toString());
  });

  app.get("/auth/google/callback", async (req, reply) => {
    const { code, state } = req.query || {};
    const storedState = req.cookies?.g_state;
    const verifier = req.cookies?.g_verifier;
    if (!code || !state || state !== storedState || !verifier)
      return reply.code(400).send({ error: "invalid oauth state" });
    let tokens;
    try { tokens = await client().validateAuthorizationCode(code, verifier); }
    catch { return reply.code(400).send({ error: "code exchange failed" }); }
    const claims = decodeIdToken(tokens.idToken());
    const googleId = claims.sub, email = claims.email;
    let user = await prisma.user.findFirst({ where: { OR: [{ googleId }, { email }] } });
    if (!user) user = await prisma.user.create({ data: { email, googleId, emailVerified: true, trialEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) } });
    else if (!user.googleId) user = await prisma.user.update({ where: { id: user.id }, data: { googleId, emailVerified: true } });
    const { token, expiresAt } = await createSession(user.id);
    reply.setCookie(config.cookieName, token, { httpOnly: true, sameSite: config.isProd ? "none" : "lax", secure: config.isProd, path: "/", expires: expiresAt });
    return reply.redirect(config.frontendOrigin);
  });
}
