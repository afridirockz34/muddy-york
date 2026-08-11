export function resolveEntitlement({ status, currentPeriodEnd, trialEnd }, now = new Date()) {
  const t = now.getTime();
  const paidActive = status === "active" && currentPeriodEnd && new Date(currentPeriodEnd).getTime() > t;
  if (paidActive) return "active";
  // A Stripe card-on-file trial (subscription status "trialing") is premium.
  if (status === "trialing") return "trialing";
  // Legacy app-level no-card trial (backward compat; not granted to new users).
  if (trialEnd && new Date(trialEnd).getTime() > t) return "trialing";
  return "free";
}
export function isPremium(entitlement) {
  return entitlement === "active" || entitlement === "trialing";
}
