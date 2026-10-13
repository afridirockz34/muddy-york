import { randomBytes } from "node:crypto";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { getStripe } from "../billing/stripe.js";
import { getCurrentUser } from "../auth/current-user.js";
import { sendMail } from "../alerts/mailer.js";
import { emailProblem } from "../../../lib/email-validate.js";

// Gift memberships: someone buys a year on the website (Stripe Checkout,
// one-time payment), we email a code, the angler redeems it in the app.
export const GIFT_PRICE_CENTS = 5999; // same as the yearly plan
const SITE = "https://muddyyorkfishing.ca";
const ALPH = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
export function newGiftCode() {
  const b = randomBytes(8); let s = "";
  for (let i = 0; i < 8; i++) s += ALPH[b[i] % ALPH.length];
  return `MY-${s.slice(0, 4)}-${s.slice(4)}`;
}
const clean = (v, n) => String(v ?? "").trim().slice(0, n);

// Called from the Stripe webhook when a gift checkout is paid.
export async function fulfillGift(session, { send = sendMail } = {}) {
  if (!session || session.payment_status !== "paid") return null;
  const existing = await prisma.giftCode.findUnique({ where: { sessionId: session.id } });
  if (existing) return existing; // webhooks can repeat
  const m = session.metadata || {};
  const buyerEmail = session.customer_details?.email || session.customer_email || m.buyerEmail;
  if (!buyerEmail) return null;
  let gift = null;
  for (let i = 0; i < 5 && !gift; i++) {
    try {
      gift = await prisma.giftCode.create({ data: { code: newGiftCode(), sessionId: session.id, buyerEmail,
        paymentIntent: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || null,
        termsVersion: m.termsVersion || null,
        recipientEmail: m.recipientEmail || null, recipientName: m.recipientName || null, fromName: m.fromName || null, message: m.message || null } });
    } catch (e) { if (!String(e?.code).includes("P2002")) throw e; }
  }
  if (!gift) return null;
  const redeem = `${SITE}/?redeem=${gift.code}`;
  const forWho = gift.recipientName ? ` for ${gift.recipientName}` : "";
  await send({ to: buyerEmail, subject: "Your Muddy York Fishing gift", heading: "Thanks for the gift",
    text: `Your gift membership${forWho} is ready: one year of Muddy York Fishing.

Gift code: **${gift.code}**

${gift.recipientEmail ? `We've also emailed it to ${gift.recipientEmail}.` : "Pass the code on, or forward this email."} To use it, they open the link below, sign in or create a free account, and the year starts right away.

Refunds: you can ask for a refund within 14 days of purchase as long as the code hasn't been redeemed. Once it's redeemed it can't be refunded, and a refunded code stops working. Full terms: ${SITE}/terms/#refunds`,
    cta: { label: "Redeem the gift", url: redeem } }).catch(() => {});
  if (gift.recipientEmail) {
    await send({ to: gift.recipientEmail, subject: `${gift.fromName || "Someone"} gave you a year of Muddy York Fishing`, heading: "You've been given a year on the water",
      text: `${gift.fromName || "A friend"} gave you a year of Muddy York Fishing: live river conditions every morning, the official season for every stretch, and what to tie on, for 30+ Southern Ontario trout and salmon rivers.${gift.message ? `\n\nTheir note: "${gift.message}"` : ""}

Your gift code: **${gift.code}**

Tap the button, sign in or create a free account, and your year starts right away.`,
      cta: { label: "Start my year", url: redeem } }).catch(() => {});
  }
  if (config.resend.billingEmail) send({ to: config.resend.billingEmail, subject: "[Muddy York Fishing] Gift membership sold", text: `${buyerEmail} bought a gift membership (${gift.code}).`, plain: true }).catch(() => {});
  return gift;
}

// A gift's payment was refunded (or lost in a dispute): cancel the code, and if
// it was already redeemed, take the gifted time back off that account.
export async function cancelGiftForPayment(paymentIntent, { reason = "refund" } = {}) {
  if (!paymentIntent) return null;
  const gift = await prisma.giftCode.findUnique({ where: { paymentIntent } });
  if (!gift || gift.canceledAt) return gift;
  await prisma.giftCode.update({ where: { id: gift.id }, data: { canceledAt: new Date() } });
  if (gift.redeemedBy) {
    const u = await prisma.user.findUnique({ where: { id: gift.redeemedBy } });
    if (u && u.giftUntil) {
      const until = new Date(u.giftUntil); until.setMonth(until.getMonth() - gift.months);
      await prisma.user.update({ where: { id: u.id }, data: { giftUntil: until > new Date() ? until : null } });
    }
  }
  if (config.resend.billingEmail) sendMail({ to: config.resend.billingEmail, subject: "[Muddy York Fishing] Gift cancelled", plain: true,
    text: `Gift ${gift.code} (bought by ${gift.buyerEmail}) was cancelled after a ${reason}.${gift.redeemedBy ? " It had been redeemed; the gifted time was removed." : ""}` }).catch(() => {});
  return gift;
}

export default async function giftRoutes(app) {
  // Start a gift purchase. No account needed: Stripe collects the buyer's email.
  app.post("/gift/checkout", async (req, reply) => {
    const b = req.body || {};
    const recipientEmail = clean(b.recipientEmail, 200).toLowerCase();
    if (recipientEmail && emailProblem(recipientEmail)) return reply.code(400).send({ error: "invalid recipient email" });
    const metadata = { kind: "gift", recipientEmail, recipientName: clean(b.recipientName, 60), fromName: clean(b.fromName, 60), message: clean(b.message, 300),
      termsVersion: clean(b.termsVersion, 20) || "unspecified" };
    try {
      const session = await getStripe().checkout.sessions.create({
        mode: "payment",
        line_items: [{ quantity: 1, price_data: { currency: "cad", unit_amount: GIFT_PRICE_CENTS,
          product_data: { name: "Muddy York Fishing gift membership (1 year)", description: "A year of live river conditions, official seasons and fly picks for Southern Ontario." } } }],
        metadata, payment_intent_data: { metadata },
        allow_promotion_codes: true,
        success_url: `${SITE}/gifts/thanks/`,
        cancel_url: `${SITE}/gifts/`,
      });
      return { url: session.url };
    } catch (e) {
      req.log.error({ err: e }, "gift checkout failed");
      return reply.code(502).send({ error: "couldn't start checkout" });
    }
  });

  // Redeem a gift code: a year of membership, added to any gift time left.
  app.post("/gift/redeem", async (req, reply) => {
    const u = await getCurrentUser(req);
    if (!u) return reply.code(401).send({ error: "sign in first" });
    const code = clean(req.body?.code, 20).toUpperCase().replace(/\s+/g, "");
    const gift = code ? await prisma.giftCode.findUnique({ where: { code } }) : null;
    if (!gift) return reply.code(404).send({ error: "That code doesn't match a gift. Check it and try again." });
    if (gift.canceledAt) return reply.code(410).send({ error: "That gift was refunded, so the code no longer works." });
    if (gift.redeemedBy && gift.redeemedBy !== u.id) return reply.code(409).send({ error: "That gift code has already been used." });
    if (gift.redeemedBy === u.id) return { ok: true, giftUntil: u.giftUntil };
    const sub = await prisma.subscription.findUnique({ where: { userId: u.id } });
    if (sub && (sub.status === "active" || sub.status === "trialing"))
      return reply.code(409).send({ error: "You already have a membership. Email info@muddyyorkfishing.ca and we'll apply the gift to your account." });
    const start = u.giftUntil && new Date(u.giftUntil) > new Date() ? new Date(u.giftUntil) : new Date();
    const until = new Date(start); until.setMonth(until.getMonth() + gift.months);
    const done = await prisma.giftCode.updateMany({ where: { id: gift.id, redeemedBy: null }, data: { redeemedBy: u.id, redeemedAt: new Date() } });
    if (!done.count) return reply.code(409).send({ error: "That gift code has already been used." });
    await prisma.user.update({ where: { id: u.id }, data: { giftUntil: until } });
    return { ok: true, giftUntil: until };
  });
}
