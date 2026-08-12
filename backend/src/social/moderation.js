import { prisma } from "../db.js";
import { config } from "../config.js";

// A single admin, identified by ADMIN_EMAIL (falls back to the Resend from-addr's
// configured admin). No schema flag needed for one moderator.
export function isAdmin(user) {
  const admin = config.resend.adminEmail;
  return !!user && !!admin && user.email === admin;
}

// User ids to hide from `userId`'s feed: everyone they've blocked, plus everyone
// who has blocked them (symmetric).
export async function blockedIdsFor(userId) {
  if (!userId) return [];
  const rows = await prisma.block.findMany({
    where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
    select: { blockerId: true, blockedId: true },
  });
  const ids = new Set();
  for (const r of rows) {
    if (r.blockerId === userId) ids.add(r.blockedId);
    if (r.blockedId === userId) ids.add(r.blockerId);
  }
  return [...ids];
}
