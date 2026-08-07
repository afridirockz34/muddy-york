import { prisma } from "../db.js";
import { resolveEntitlement } from "./entitlement.js";

export async function entitlementForUser(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { subscription: true } });
  if (!user) return "free";
  const sub = user.subscription;
  return resolveEntitlement({
    status: sub?.status || null,
    currentPeriodEnd: sub?.currentPeriodEnd || null,
    trialEnd: user.trialEnd || null,
  });
}
