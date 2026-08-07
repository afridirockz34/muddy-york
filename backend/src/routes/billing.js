import { prisma } from "../db.js";
import { config } from "../config.js";
import { getStripe } from "../billing/stripe.js";
import { getCurrentUser } from "../auth/current-user.js";

async function ensureCustomer(user) {
  if (user.stripeCustomerId) return user.stripeCustomerId;
  const customer = await getStripe().customers.create({ email: user.email, metadata: { userId: user.id } });
  await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: customer.id } });
  return customer.id;
}

export default async function billingRoutes(app) {
  app.post("/billing/checkout", async (req, reply) => {
    const user = await getCurrentUser(req);
    if (!user) return reply.code(401).send({ error: "not authenticated" });
    const plan = req.body?.plan === "annual" ? "annual" : "monthly";
    const price = plan === "annual" ? config.stripe.priceAnnual : config.stripe.priceMonthly;
    const customerId = await ensureCustomer(user);
    const session = await getStripe().checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price, quantity: 1 }],
      client_reference_id: user.id,
      success_url: config.stripe.successUrl,
      cancel_url: config.stripe.cancelUrl,
    });
    return { url: session.url };
  });

  app.post("/billing/portal", async (req, reply) => {
    const user = await getCurrentUser(req);
    if (!user) return reply.code(401).send({ error: "not authenticated" });
    if (!user.stripeCustomerId) return reply.code(400).send({ error: "no billing account yet" });
    const session = await getStripe().billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: config.stripe.successUrl,
    });
    return { url: session.url };
  });
}
