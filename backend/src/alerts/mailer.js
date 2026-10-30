import { config } from "../config.js";
import { renderEmail } from "../../../lib/email-template.js";

// Generic transactional send (used by post reports, etc.).
// Customer emails go out in the branded template (HTML + plain text) with the
// house signature. `plain: true` is for internal notices to the team.
export async function sendMail({ to, subject, text, replyTo, plain = false, heading, cta, unsubscribe, terms }, opts = {}) {
  const { fetchImpl = fetch } = opts;
  const apiKey = process.env.RESEND_API_KEY || config.resend.apiKey;
  if (!apiKey || !to) return false;
  try {
    // `to` may be a comma-separated list (e.g. ADMIN_EMAIL); Resend wants an array.
    const recipients = Array.isArray(to) ? to : String(to).split(",").map((s) => s.trim()).filter(Boolean);
    const payload = plain ? { from: config.resend.from, to: recipients, subject, text }
      : { from: config.resend.from, to: recipients, subject, ...renderEmail({ subject, text, heading, cta, unsubscribe, terms }) };
    if (replyTo) payload.reply_to = replyTo;
    const res = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return !!(res && res.ok);
  } catch {
    return false;
  }
}

// "the Credit River", but "Wilmot Creek" (no article for creeks).
export const theRiver = (name) => (/\briver$/i.test(name || "") ? `the ${name}` : name || "your river");

export async function sendAlertEmail(to, spot, opportunity, others = [], opts = {}) {
  if (!Array.isArray(others)) { opts = others || {}; others = []; }
  const subject = others.length ? `Prime conditions on ${others.length + 1} of your rivers` : `Prime conditions on ${theRiver(spot.river)}`;
  const text = `${(t => t[0].toUpperCase() + t.slice(1))(theRiver(spot.river))} (${String(spot.section || "").replace(/\s*[—–]\s*/g, ": ")}) is showing prime conditions right now, ${opportunity} out of 100.`
    + (others.length ? `\n\nAlso in the zone:\n${others.map((o) => `- ${o.river}, ${o.section}`).join("\n")}` : "")
    + `\n\nWe only alert when a saved river first reaches your threshold, at most twice a week per river. You can change that any time under Saved rivers in the app.`;
  return sendMail({ to, subject, text, heading: subject, cta: { label: "See today's conditions", url: "https://muddyyorkfishing.ca/?app" } }, opts);
}
