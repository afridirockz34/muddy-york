import { prisma } from "../db.js";
import { config } from "../config.js";
import { getStripe } from "../billing/stripe.js";
import { getCurrentUser } from "../auth/current-user.js";

async function ensureCustomer(user) {
  // Reuse the stored customer only if it still exists in the CURRENT Stripe mode.
  // A test→live key switch leaves a stale test id that fails checkout, so we
  // verify it and transparently recreate when it's gone/deleted.
  if (user.stripeCustomerId) {
    try {
      const c = await getStripe().customers.retrieve(user.stripeCustomerId);
      if (c && !c.deleted) return user.stripeCustomerId;
    } catch { /* not found in this mode — fall through and make a fresh one */ }
  }
  const customer = await getStripe().customers.create({ email: user.email, metadata: { userId: user.id } });
  await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: customer.id } });
  return customer.id;
}

export default async function billingRoutes(app) {
  // Public: the frontend needs the publishable key to mount embedded checkout.
  app.get("/billing/config", async () => ({ publishableKey: config.stripe.publishableKey }));

  // Safe diagnostics: reveals only the MODE of each Stripe setting (test/live/
  // unset) and whether ids are present — never the secret values. Used to catch
  // a partial live migration (e.g. live publishable key but test secret/prices),
  // which makes embedded checkout fail with "Something went wrong".
  app.get("/billing/diagnostics", async () => {
    const modeOf = (k, live, test) => (typeof k === "string" && k.startsWith(live) ? "live" : typeof k === "string" && k.startsWith(test) ? "test" : "unset");
    const publishable = modeOf(config.stripe.publishableKey, "pk_live", "pk_test");
    const secret = modeOf(config.stripe.secretKey, "sk_live", "sk_test");
    return {
      publishable,
      secret,
      keysAligned: publishable !== "unset" && publishable === secret,
      priceMonthlySet: !!config.stripe.priceMonthly,
      priceAnnualSet: !!config.stripe.priceAnnual,
      webhookSecretSet: !!config.stripe.webhookSecret,
    };
  });

  app.post("/billing/checkout", async (req, reply) => {
    const user = await getCurrentUser(req);
    if (!user) return reply.code(401).send({ error: "not authenticated" });
    const plan = req.body?.plan === "annual" ? "annual" : "monthly";
    const price = plan === "annual" ? config.stripe.priceAnnual : config.stripe.priceMonthly;
    try {
      const customerId = await ensureCustomer(user);
      const session = await getStripe().checkout.sessions.create({
        ui_mode: "embedded",
        mode: "subscription",
        customer: customerId,
        line_items: [{ price, quantity: 1 }],
        client_reference_id: user.id,
        subscription_data: { trial_period_days: 14 },
        allow_promotion_codes: true, // show the "Add promotion code" field at checkout
        return_url: `${config.frontendOrigin}/?checkout=complete`,
      });
      return { clientSecret: session.client_secret };
    } catch (e) {
      // Surface the real Stripe reason (bad price id, wrong mode, etc.) instead of a blank 500.
      req.log?.error?.({ err: e?.raw || e }, "stripe checkout create failed");
      return reply.code(502).send({ error: e?.raw?.message || e?.message || "checkout unavailable" });
    }
  });

  app.post("/billing/portal", async (req, reply) => {
    const user = await getCurrentUser(req);
    if (!user) return reply.code(401).send({ error: "not authenticated" });
    if (!user.stripeCustomerId) return reply.code(400).send({ error: "no billing account yet" });
    try {
      const session = await getStripe().billingPortal.sessions.create({
        customer: user.stripeCustomerId,
        return_url: config.frontendOrigin,
      });
      return { url: session.url };
    } catch (e) {
      req.log?.error?.({ err: e?.raw || e }, "stripe portal create failed");
      return reply.code(502).send({ error: e?.raw?.message || e?.message || "billing portal unavailable" });
    }
  });
}
