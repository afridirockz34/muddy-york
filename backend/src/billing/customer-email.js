import { sendMail } from "../alerts/mailer.js";
import { unsubUrl } from "./email-tokens.js";

// Send a transactional email to a customer, honouring their opt-out and
// appending a signed one-click unsubscribe footer.
export async function emailCustomer(user, subject, body) {
  if (!user || !user.email || user.emailOptOut) return false;
  const url = unsubUrl(user.id);
  const footer = url
    ? `\n\n—\nMuddy York Fishing · Southern Ontario\nManage your membership anytime in the app. Prefer not to receive emails? Unsubscribe: ${url}`
    : "\n\n— Muddy York Fishing";
  return sendMail({ to: user.email, subject, text: body + footer });
}

const money = (cents, currency) =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency: (currency || "cad").toUpperCase() }).format((cents || 0) / 100);

// Welcome email sent when a free trial starts at checkout.
export function welcomeEmail(user) {
  return emailCustomer(
    user,
    "Welcome to Muddy York Fishing — your 14-day trial is live",
    `Hi${user.displayName ? " " + user.displayName : ""},

Welcome to the club. Your 14-day free trial is active, so every river, spot, strategy and your personal guide are unlocked.

You won't be charged until the trial ends, and you can cancel anytime from your account in the app.

Tight lines,
The Muddy York Fishing crew`,
  );
}

// Receipt email sent on each successful paid invoice.
export function receiptEmail(user, invoice) {
  const amount = money(invoice.amount_paid, invoice.currency);
  const date = new Date((invoice.created || Date.now() / 1000) * 1000).toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" });
  const link = invoice.hosted_invoice_url ? `\n\nView or download your receipt: ${invoice.hosted_invoice_url}` : "";
  return emailCustomer(
    user,
    "Your Muddy York Fishing receipt",
    `Hi${user.displayName ? " " + user.displayName : ""},

Thanks for being a member. Here's your receipt:

  Amount:  ${amount}
  Date:    ${date}${invoice.number ? `\n  Invoice: ${invoice.number}` : ""}

Your membership keeps every river, spot and strategy unlocked. Manage or cancel anytime from your account in the app.${link}

Tight lines,
The Muddy York Fishing crew`,
  );
}
