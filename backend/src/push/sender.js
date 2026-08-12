import webpush from "web-push";
import { prisma } from "../db.js";
import { config } from "../config.js";

let configured = false;
function ensure() {
  if (configured) return true;
  if (!config.vapid.configured) return false;
  webpush.setVapidDetails(config.vapid.subject, config.vapid.publicKey, config.vapid.privateKey);
  configured = true;
  return true;
}

// Send a push to all of a user's subscriptions. Prunes dead endpoints (410/404).
// Returns true if at least one push was accepted.
export async function sendPushToUser(userId, payload, opts = {}) {
  const send = opts.send || ((sub, data) => webpush.sendNotification(sub, data));
  if (!opts.send && !ensure()) return false;
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  let ok = false;
  for (const s of subs) {
    const sub = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
    try {
      await send(sub, JSON.stringify(payload));
      ok = true;
    } catch (e) {
      const code = e && e.statusCode;
      if (code === 404 || code === 410) {
        await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
      }
    }
  }
  return ok;
}
