import { createHmac } from "node:crypto";
import { config } from "../config.js";

// One-click unsubscribe links are signed with an HMAC so no per-user token
// needs to be stored. The link stays valid unless the secret rotates.
function secret() {
  return config.resend.emailSecret || "muddy-york-fallback-secret";
}

export function unsubToken(userId) {
  return createHmac("sha256", secret()).update("unsub:" + userId).digest("base64url").slice(0, 32);
}

export function verifyUnsub(userId, token) {
  return !!userId && !!token && token === unsubToken(userId);
}

// Absolute URL to the /unsubscribe route on this backend, or null if the public
// base URL isn't configured (in which case emails just omit the link).
export function unsubUrl(userId) {
  const base = config.resend.unsubBase;
  if (!base) return null;
  return `${base.replace(/\/$/, "")}/unsubscribe?u=${encodeURIComponent(userId)}&t=${unsubToken(userId)}`;
}
