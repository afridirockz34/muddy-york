import { prisma } from "../db.js";
import { verifyUnsub } from "../billing/email-tokens.js";

function page(title, message) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title} · Muddy York Fishing</title>
<style>
  body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#2C4C3B;color:#F4EFE6;
    display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px}
  .card{max-width:440px;background:#FBF8F0;color:#22321f;border:1.5px solid #C6A052;border-radius:16px;padding:30px 28px;text-align:center;box-shadow:0 10px 34px rgba(0,0,0,.3)}
  h1{font-family:Georgia,serif;font-size:22px;margin:0 0 10px;color:#22321f}
  p{font-size:14.5px;line-height:1.6;color:#4a5a44;margin:0}
</style></head><body><div class="card"><h1>${title}</h1><p>${message}</p></div></body></html>`;
}

export default async function unsubscribeRoutes(app) {
  app.get("/unsubscribe", async (req, reply) => {
    const { u, t } = req.query || {};
    const ok = u && verifyUnsub(u, t);
    if (ok) {
      await prisma.user.update({ where: { id: u }, data: { emailOptOut: true } }).catch(() => {});
    }
    reply
      .type("text/html")
      .send(
        ok
          ? page("You're unsubscribed", "You won't receive any more emails from Muddy York Fishing. This doesn't change your membership — manage or cancel that anytime from your account in the app.")
          : page("Link expired", "We couldn't process that unsubscribe link. You can manage email preferences from your account in the app."),
      );
  });
}
