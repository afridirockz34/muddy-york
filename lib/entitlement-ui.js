export function isPremiumMe(me) { return !!me && (me.entitlement === "active" || me.entitlement === "trialing"); }
export function entitlementLabel(me) {
  if (!me || !me.user) return "Sign in";
  if (me.entitlement === "active") return "Member";
  if (me.entitlement === "trialing") return "Trial";
  return "Free";
}
export const PRICES = { monthly: 9.99, annual: 59.99 };
export const TRIAL_DAYS = 7;
export function planPrice(plan) { return plan === "annual" ? "$59.99/yr" : "$9.99/mo"; }
// What the plan works out to per month: "$9.99/mo" or "$5.00/mo" (annual).
export function planMonthly(plan) { return `$${(plan === "annual" ? PRICES.annual / 12 : PRICES.monthly).toFixed(2)}/mo`; }
// Annual saving versus paying monthly for a year, as a whole percent.
export function annualSavingPct() { return Math.round((1 - PRICES.annual / (PRICES.monthly * 12)) * 100); }
