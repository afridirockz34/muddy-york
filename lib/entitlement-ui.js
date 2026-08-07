export function isPremiumMe(me) { return !!me && (me.entitlement === "active" || me.entitlement === "trialing"); }
export function entitlementLabel(me) {
  if (!me || !me.user) return "Sign in";
  if (me.entitlement === "active") return "Member";
  if (me.entitlement === "trialing") return "Trial";
  return "Free";
}
export function planPrice(plan) { return plan === "annual" ? "$59.99/yr" : "$9.99/mo"; }
