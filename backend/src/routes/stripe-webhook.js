import { config } from "../config.js";
import { prisma } from "../db.js";
import { getStripe } from "../billing/stripe.js";
import { sendMail } from "../alerts/mailer.js";
import { welcomeEmail, receiptEmail } from "../billing/customer-email.js";

// Notify the business owner about membership lifecycle events.
function notifyBilling(subject, text) {
  if (!config.resend.billingEmail) return;
  sendMail({ to: config.resend.billingEmail, subject: `[Muddy York Fishing] ${subject}`, text }).catch(() => {});
}

// A user has exactly one Subscription row (userId is unique). Key the upsert by
// userId — NOT by the Stripe subscription id — so re-subscribing (a brand-new
// Stripe sub id) updates the same row instead of failing the unique constraint
// and leaving the user stranded on their old/canceled subscription.
async function upsertSubscription(userId, { id, status, priceId, currentPeriodEnd }) {
  const data = {
    id,
    status,
    priceId: priceId || null,
    currentPeriodEnd: currentPeriodEnd ? new Date(currentPeriodEnd * 1000) : null,
  };
  await prisma.subscription.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
}

// current_period_end moved from the subscription onto its items in newer Stripe
// API versions — read whichever is present.
function periodEndOf(sub) {
  return sub.current_period_end || sub.items?.data?.[0]?.current_period_end || null;
}

const TERMINAL_STATUSES = ["canceled", "incomplete_expired", "unpaid"];
// A late cancel/delete for a PREVIOUS subscription must not overwrite the user's
// current one after they re-subscribed. Ignore terminal events whose sub id no
// longer matches the row we track.
export function ignoreStaleSubEvent(existingId, eventSubId, status) {
  return !!existingId && existingId !== eventSubId && TERMINAL_STATUSES.includes(status);
}

export default async function stripeWebhookRoutes(app) {
  // Stripe needs the raw body for signature verification. This parser is
  // encapsulated to this plugin, whose only route is the webhook, so we always
  // capture the raw bytes here.
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (req, body, done) => {
    req.rawBody = body;
    done(null, undefined);
  });

  app.post("/webhooks/stripe", async (req, reply) => {
    let event;
    try {
      event = getStripe().webhooks.constructEvent(
        req.rawBody,
        req.headers["stripe-signature"],
        config.stripe.webhookSecret,
      );
    } catch {
      return reply.code(400).send({ error: "invalid signature" });
    }
    const obj = event.data.object;
    if (event.type === "checkout.session.completed") {
      const userId = obj.client_reference_id;
      if (userId && obj.subscription) {
        await prisma.user.update({ where: { id: userId }, data: { stripeCustomerId: obj.customer } }).catch(() => {});
        // Our checkout always creates a 14-day trial; subscription events fill the rest.
        await upsertSubscription(userId, { id: obj.subscription, status: "trialing", priceId: null, currentPeriodEnd: null });
        const u = await prisma.user.findUnique({ where: { id: userId } });
        notifyBilling("New free trial started", `${u?.email || userId} started a 14-day free trial (card on file).`);
        if (u) welcomeEmail(u).catch(() => {});
      }
    } else if (event.type === "invoice.payment_succeeded") {
      // A paid invoice = send the customer a receipt. Skip $0 trial invoices.
      if (obj.amount_paid > 0 && obj.customer) {
        const user = await prisma.user.findFirst({ where: { stripeCustomerId: obj.customer } });
        if (user) receiptEmail(user, obj).catch(() => {});
      }
    } else if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      const user = await prisma.user.findFirst({ where: { stripeCustomerId: obj.customer } });
      if (user) {
        const existing = await prisma.subscription.findUnique({ where: { userId: user.id } });
        const status = event.type === "customer.subscription.deleted" ? "canceled" : obj.status;
        // Ignore a late cancel/delete of a previous sub after the user re-subscribed.
        if (ignoreStaleSubEvent(existing?.id, obj.id, status)) {
          return { received: true };
        }
        const prior = existing && existing.id === obj.id ? existing : null;
        await upsertSubscription(user.id, {
          id: obj.id,
          status,
          priceId: obj.items?.data?.[0]?.price?.id,
          currentPeriodEnd: periodEndOf(obj),
        });
        const was = prior?.status;
        // Trial (or anything) converting to a paid, active membership.
        if (status === "active" && was !== "active") {
          notifyBilling("New paid membership", `${user.email} is now an active paying member.`);
        }
        // Membership cancelled (or scheduled to cancel at period end).
        if ((status === "canceled" || obj.cancel_at_period_end) && was !== "canceled" && was !== undefined) {
          const pe = periodEndOf(obj);
          const end = pe ? new Date(pe * 1000).toDateString() : "now";
          notifyBilling("Membership cancelled", `${user.email} cancelled their membership (access ends ${end}).`);
        }
      }
    }
    return { received: true };
  });
}
