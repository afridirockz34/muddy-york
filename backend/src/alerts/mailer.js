import { config } from "../config.js";

// Generic transactional send (used by post reports, etc.).
export async function sendMail({ to, subject, text, replyTo }, opts = {}) {
  const { fetchImpl = fetch } = opts;
  const apiKey = process.env.RESEND_API_KEY || config.resend.apiKey;
  if (!apiKey || !to) return false;
  try {
    // `to` may be a comma-separated list (e.g. ADMIN_EMAIL); Resend wants an array.
    const recipients = Array.isArray(to) ? to : String(to).split(",").map((s) => s.trim()).filter(Boolean);
    const payload = { from: config.resend.from, to: recipients, subject, text };
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

export async function sendAlertEmail(to, spot, opportunity, others = [], opts = {}) {
  if (!Array.isArray(others)) { opts = others || {}; others = []; }
  const { fetchImpl = fetch } = opts;
  const apiKey = process.env.RESEND_API_KEY || config.resend.apiKey;
  if (!apiKey) return false;
  try {
    const res = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: config.resend.from,
        to,
        subject: others.length ? `Prime conditions on ${others.length + 1} of your rivers` : `Prime conditions on the ${spot.river}`,
        text: `${spot.river}, ${spot.section}, is showing prime conditions right now (opportunity ${opportunity}/100).`
          + (others.length ? `\n\nAlso in the zone: ${others.map((o) => `${o.river} (${o.section})`).join(", ")}.` : "")
          + `\n\nWe only alert when a saved river first reaches your threshold, at most twice a week per river. Change it any time under Saved rivers in the app.\n\nTight lines,\nMuddy York Fishing`,
      }),
    });
    return !!(res && res.ok);
  } catch {
    return false;
  }
}
