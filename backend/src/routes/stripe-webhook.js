import { config } from "../config.js";
import { prisma } from "../db.js";
import { getStripe } from "../billing/stripe.js";

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
      }
    } else if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      const user = await prisma.user.findFirst({ where: { stripeCustomerId: obj.customer } });
      if (user) {
        const status = event.type === "customer.subscription.deleted" ? "canceled" : obj.status;
        await upsertSubscription(user.id, {
          id: obj.id,
          status,
          priceId: obj.items?.data?.[0]?.price?.id,
          currentPeriodEnd: obj.current_period_end,
        });
      }
    }
    return { received: true };
  });
}
