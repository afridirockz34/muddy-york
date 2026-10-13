import { prisma } from "../db.js";

// Everyone has a username. Google sign-ups arrive without one, so they get a
// placeholder ("angler" + digits, never anything from their email or name)
// and are asked to pick their own; until then the placeholder shows.
export async function placeholderUsername() {
  for (let i = 0; i < 20; i++) {
    const name = `angler${Math.floor(10000 + Math.random() * 90000)}`;
    const taken = await prisma.user.findFirst({ where: { displayName: { equals: name, mode: "insensitive" } }, select: { id: true } });
    if (!taken) return name;
  }
  return `angler${Date.now().toString().slice(-8)}`;
}

// Accounts created before this rule (or abandoned mid sign-up) get one too.
export async function backfillUsernames(log = console) {
  const rows = await prisma.user.findMany({ where: { OR: [{ displayName: null }, { displayName: "" }] }, select: { id: true } });
  for (const r of rows) {
    await prisma.user.update({ where: { id: r.id }, data: { displayName: await placeholderUsername(), usernameChosen: false } }).catch(() => {});
  }
  if (rows.length) log.info?.({ count: rows.length }, "placeholder usernames assigned");
  return rows.length;
}
