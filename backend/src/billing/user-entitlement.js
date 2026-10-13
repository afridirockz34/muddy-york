import { prisma } from "../db.js";
import { resolveEntitlement } from "./entitlement.js";

export async function entitlementForUser(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { subscription: true } });
  if (!user) return "free";
  const sub = user.subscription;
  // A redeemed gift is a full membership until it ends.
  if (user.giftUntil && new Date(user.giftUntil).getTime() > Date.now()) return "active";
  return resolveEntitlement({
    status: sub?.status || null,
    currentPeriodEnd: sub?.currentPeriodEnd || null,
    trialEnd: user.trialEnd || null,
  });
}
