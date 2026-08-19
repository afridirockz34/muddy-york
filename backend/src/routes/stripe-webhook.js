import { config } from "../config.js";
import { prisma } from "../db.js";
import { getStripe } from "../billing/stripe.js";
import { sendMail } from "../alerts/mailer.js";

// Notify the business owner about membership lifecycle events.
function notifyBilling(subject, text) {
  if (!config.resend.billingEmail) return;
  sendMail({ to: config.resend.billingEmail, subject: `[Muddy York Fishing] ${subject}`, text }).catch(() => {});
}

async function upsertSubscription(userId, { id, status, priceId, currentPeriodEnd }) {
  const data = {
    status,
    priceId: priceId || null,
    currentPeriodEnd: currentPeriodEnd ? new Date(currentPeriodEnd * 1000) : null,
  };
  await prisma.subscription.upsert({
    where: { id },
    create: { id, userId, ...data },
    update: data,
  });
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
      }
    } else if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      const user = await prisma.user.findFirst({ where: { stripeCustomerId: obj.customer } });
      if (user) {
        const prior = await prisma.subscription.findUnique({ where: { id: obj.id } });
        const status = event.type === "customer.subscription.deleted" ? "canceled" : obj.status;
        await upsertSubscription(user.id, {
          id: obj.id,
          status,
          priceId: obj.items?.data?.[0]?.price?.id,
          currentPeriodEnd: obj.current_period_end,
        });
        const was = prior?.status;
        // Trial (or anything) converting to a paid, active membership.
        if (status === "active" && was !== "active") {
          notifyBilling("New paid membership", `${user.email} is now an active paying member.`);
        }
        // Membership cancelled (or scheduled to cancel at period end).
        if ((status === "canceled" || obj.cancel_at_period_end) && was !== "canceled" && was !== undefined) {
          const end = obj.current_period_end ? new Date(obj.current_period_end * 1000).toDateString() : "now";
          notifyBilling("Membership cancelled", `${user.email} cancelled their membership (access ends ${end}).`);
        }
      }
    }
    return { received: true };
  });
}
