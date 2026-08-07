import { getCurrentUser } from "../auth/current-user.js";
import { entitlementForUser } from "./user-entitlement.js";
import { isPremium } from "./entitlement.js";

export async function requirePremium(req, reply) {
  const user = await getCurrentUser(req);
  if (!user) return reply.code(401).send({ error: "not authenticated" });
  const entitlement = await entitlementForUser(user.id);
  if (!isPremium(entitlement)) return reply.code(402).send({ error: "subscription required", entitlement });
  req.user = user;
}
