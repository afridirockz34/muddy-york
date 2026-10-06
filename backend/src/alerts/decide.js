// Alerts fire on the *crossing*, not on every hour a river stays good.
// A saved river alerts once when it rises to the threshold, then stays quiet
// until it drops clearly back below (HYSTERESIS points) and rises again.
// On top of that: at most MAX_PER_WEEK alerts per river in 7 days, and at
// most one message per user every USER_GAP_H hours (several rivers at once
// are bundled into that one message).
export const HYSTERESIS = 10;
export const MAX_PER_WEEK = 2;
export const USER_GAP_H = 12;
const WEEK = 7 * 24 * 3600000;

export function recentAlerts(log, now = new Date()) {
  return (Array.isArray(log) ? log : []).filter((t) => now.getTime() - new Date(t).getTime() < WEEK);
}

// -> { send, armed }  where armed is the river's new armed state.
export function decideSpot({ opportunity, threshold, armed = true, log = [] }, now = new Date()) {
  if (opportunity < threshold - HYSTERESIS) return { send: false, armed: true };
  if (opportunity < threshold) return { send: false, armed };
  if (!armed) return { send: false, armed: false };
  if (recentAlerts(log, now).length >= MAX_PER_WEEK) return { send: false, armed };
  return { send: true, armed: false };
}

export function userCanReceive(lastAlertAt, now = new Date()) {
  if (!lastAlertAt) return true;
  return now.getTime() - new Date(lastAlertAt).getTime() >= USER_GAP_H * 3600000;
}

// Kept for the older call sites/tests: a plain threshold + cooldown check.
export function shouldAlert({ opportunity, threshold, lastAlertAt }, now = new Date(), cooldownH = 20) {
  if (opportunity < threshold) return false;
  if (!lastAlertAt) return true;
  return now.getTime() - new Date(lastAlertAt).getTime() >= cooldownH * 3600000;
}
