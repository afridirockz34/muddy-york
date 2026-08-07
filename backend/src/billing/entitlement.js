export function resolveEntitlement({ status, currentPeriodEnd, trialEnd }, now = new Date()) {
  const t = now.getTime();
  const paidActive = status === "active" && currentPeriodEnd && new Date(currentPeriodEnd).getTime() > t;
  if (paidActive) return "active";
  if (trialEnd && new Date(trialEnd).getTime() > t) return "trialing";
  return "free";
}
export function isPremium(entitlement) {
  return entitlement === "active" || entitlement === "trialing";
}
