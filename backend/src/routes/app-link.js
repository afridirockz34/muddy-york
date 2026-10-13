import { prisma } from "../db.js";
import { getCurrentUser } from "../auth/current-user.js";
import { sendMail } from "../alerts/mailer.js";

// Desktop users: email me the link so I can add the app to my phone. Once a day.
export default async function appLinkRoutes(app, opts = {}) {
  const send = opts.sendMail || sendMail;
  app.post("/me/send-app-link", async (req, reply) => {
    const u = await getCurrentUser(req);
    if (!u) return reply.code(401).send({ error: "sign in first" });
    if (u.appLinkSentAt && Date.now() - new Date(u.appLinkSentAt).getTime() < 864e5) return { ok: true, already: true };
    const ok = await send({ to: u.email, subject: "Muddy York Fishing on your phone",
      text: `Open this on your phone to add Muddy York Fishing to your home screen:

https://muddyyorkfishing.ca/?signin

On iPhone: open it in Safari, tap Share, then "Add to Home Screen".
On Android: open it in Chrome and tap "Install app" (or the menu, then "Add to Home screen").

Sign in with the same account and your saved rivers come with you.

Tight lines,
Muddy York Fishing` });
    if (ok) await prisma.user.update({ where: { id: u.id }, data: { appLinkSentAt: new Date() } });
    return { ok: !!ok };
  });
}
