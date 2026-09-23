import { prisma } from "../db.js";
import { config } from "../config.js";

// A single admin, identified by ADMIN_EMAIL (falls back to the Resend from-addr's
// configured admin). No schema flag needed for one moderator.
export function isAdmin(user) {
  if (!user || !user.email) return false;
  // adminEmail may be a plain email, a comma list, or a "Name <addr>" string —
  // normalise all of them and compare case-insensitively.
  const emails = String(config.resend.adminEmail || "")
    .split(",")
    .map((s) => { const m = s.match(/<([^>]+)>/); return (m ? m[1] : s).trim().toLowerCase(); })
    .filter(Boolean);
  return emails.includes(String(user.email).trim().toLowerCase());
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
