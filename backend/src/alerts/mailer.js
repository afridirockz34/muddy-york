import { config } from "../config.js";

// Generic transactional send (used by post reports, etc.).
export async function sendMail({ to, subject, text }, opts = {}) {
  const { fetchImpl = fetch } = opts;
  const apiKey = process.env.RESEND_API_KEY || config.resend.apiKey;
  if (!apiKey || !to) return false;
  try {
    const res = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: config.resend.from, to, subject, text }),
    });
    return !!(res && res.ok);
  } catch {
    return false;
  }
}

export async function sendAlertEmail(to, spot, opportunity, opts = {}) {
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
        subject: `Prime conditions on the ${spot.river}`,
        text: `${spot.river} — ${spot.section} is showing prime conditions right now (opportunity ${opportunity}/100). Tight lines.\n\n— Muddy York Angling Co.`,
      }),
    });
    return !!(res && res.ok);
  } catch {
    return false;
  }
}
