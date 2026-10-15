import { sendMail } from "../alerts/mailer.js";
import { unsubUrl } from "./email-tokens.js";

// Send a transactional email to a customer, honouring their opt-out and
// appending a signed one-click unsubscribe footer.
export async function emailCustomer(user, subject, body, { heading, cta, terms } = {}) {
  if (!user || !user.email || user.emailOptOut) return false;
  return sendMail({ to: user.email, subject, text: body, heading, cta, terms, unsubscribe: unsubUrl(user.id) || undefined });
}

const money = (cents, currency) =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency: (currency || "cad").toUpperCase() }).format((cents || 0) / 100);

// Welcome email sent when a free trial starts at checkout.
export function welcomeEmail(user) {
  return emailCustomer(
    user,
    "Welcome to Muddy York Fishing. Your 7-day trial is live",
    `Hi${user.displayName ? " " + user.displayName : ""},

Welcome to the club. Your 7-day free trial is active, so every river, spot, strategy and your personal guide are unlocked.

You won't be charged until the trial ends, and you can cancel anytime from your account in the app.`,
    { terms: true, heading: "Welcome to the club", cta: { label: "Open the app", url: "https://muddyyorkfishing.ca/?app" } },
  );
}

// Receipt email sent on each successful paid invoice.
export function receiptEmail(user, invoice) {
  const amount = money(invoice.amount_paid, invoice.currency);
  const date = new Date((invoice.created || Date.now() / 1000) * 1000).toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" });
  const link = "";
  return emailCustomer(
    user,
    "Your Muddy York Fishing receipt",
    `Hi${user.displayName ? " " + user.displayName : ""},

Thanks for being a member. Here's your receipt:

  Amount:  ${amount}
  Date:    ${date}${invoice.number ? `\n  Invoice: ${invoice.number}` : ""}

Your membership keeps every river, spot and strategy unlocked. Manage or cancel anytime from your account in the app.${link}`,
    { terms: true, heading: "Thanks for being a member", cta: invoice.hosted_invoice_url ? { label: "View your receipt", url: invoice.hosted_invoice_url } : undefined },
  );
}

const longDate = (d) => new Date(d).toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric", timeZone: "America/Toronto" });

// A few days before a free trial ends (Stripe's trial_will_end event).
export function trialEndingEmail(user, { trialEnd, amountCents, currency, interval }) {
  const amount = amountCents != null ? money(amountCents, currency) : null;
  const plan = interval === "year" ? "yearly" : "monthly";
  return emailCustomer(
    user,
    `Your free trial ends ${longDate(trialEnd)}`,
    `Hi${user.displayName ? " " + user.displayName : ""},

A heads-up: your 7-day free trial of Muddy York Fishing ends on ${longDate(trialEnd)}.${amount ? ` After that your ${plan} membership starts and you'll be charged ${amount}${interval === "year" ? " for the year" : " a month"}.` : ""}

If you'd like to keep going, you don't need to do anything. If not, cancel before ${longDate(trialEnd)} from Profile, Manage subscription, and you won't be charged.`,
    { terms: true, heading: "Your free trial ends soon", cta: { label: "Manage subscription", url: "https://muddyyorkfishing.ca/?app" } },
  );
}

// Before a yearly membership renews (Stripe's invoice.upcoming event).
export function renewalReminderEmail(user, { renewsOn, amountCents, currency }) {
  return emailCustomer(
    user,
    `Your yearly membership renews ${longDate(renewsOn)}`,
    `Hi${user.displayName ? " " + user.displayName : ""},

Your yearly Muddy York Fishing membership renews on ${longDate(renewsOn)} for ${money(amountCents, currency)}.

To keep it, you don't need to do anything. If you'd rather not renew, cancel before ${longDate(renewsOn)} from Profile, Manage subscription. You'll keep access until then.`,
    { terms: true, heading: "Your membership renews soon", cta: { label: "Manage subscription", url: "https://muddyyorkfishing.ca/?app" } },
  );
}
