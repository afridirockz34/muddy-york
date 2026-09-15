export function resolveEntitlement({ status, currentPeriodEnd, trialEnd }, now = new Date()) {
  const t = now.getTime();
  // Trust Stripe's subscription status. Stripe already moves a sub out of
  // "active"/"trialing" (to past_due/canceled/unpaid) when it lapses, so an
  // "active" status IS a paying member. Previously we also required
  // currentPeriodEnd in the future — but that field is absent from newer Stripe
  // webhook payloads (moved onto subscription items), so it was often null and
  // wrongly locked paying members out. Never gate premium on it again.
  if (status === "active") return "active";
  if (status === "trialing") return "trialing";
  // Grace: a subscription set to cancel at period end, or briefly past-due while
  // Stripe retries the card, keeps access until the paid period we know ends.
  if ((status === "past_due" || status === "canceled") && currentPeriodEnd && new Date(currentPeriodEnd).getTime() > t) return "active";
  // Legacy app-level no-card trial (backward compat; not granted to new users).
  if (trialEnd && new Date(trialEnd).getTime() > t) return "trialing";
  return "free";
}
export function isPremium(entitlement) {
  return entitlement === "active" || entitlement === "trialing";
}
