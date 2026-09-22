import { config } from "../config.js";
import { getCurrentUser } from "../auth/current-user.js";
import { sendMail } from "../alerts/mailer.js";

// In-app support: a signed-in user sends a message; it's emailed to the support
// address with their account email as the reply-to context.
export default async function supportRoutes(app) {
  app.post("/support", async (req, reply) => {
    const user = await getCurrentUser(req);
    if (!user) return reply.code(401).send({ error: "sign in first" });
    const message = String(req.body?.message || "").trim().slice(0, 4000);
    if (message.length < 3) return reply.code(400).send({ error: "please write a message" });
    const to = config.resend.supportEmail;
    if (!to) return reply.code(503).send({ error: "support is not configured yet" });
    const subject = `[Muddy York Support] from ${user.email}`;
    const text = `Support request\n\nFrom: ${user.email}${user.displayName ? ` (${user.displayName})` : ""}\nUser id: ${user.id}\n\n${message}\n`;
    const ok = await sendMail({ to, subject, text, replyTo: user.email }).catch(() => false);
    if (!ok) return reply.code(502).send({ error: "couldn't send just now — try again" });
    return { ok: true };
  });
}
