export function shouldAlert({ opportunity, threshold, lastAlertAt }, now = new Date(), cooldownH = 20) {
  if (opportunity < threshold) return false;
  if (!lastAlertAt) return true;
  return now.getTime() - new Date(lastAlertAt).getTime() >= cooldownH * 3600000;
}
