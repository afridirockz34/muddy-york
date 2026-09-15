import { randomBytes, createHash } from "node:crypto";
import { prisma } from "../db.js";

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
const sha256 = (s) => createHash("sha256").update(s).digest("hex");

export async function createSession(userId) {
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + THIRTY_DAYS);
  await prisma.session.create({ data: { id: sha256(token), userId, expiresAt } });
  return { token, expiresAt };
}
export async function validateSession(token) {
  if (!token) return null;
  const row = await prisma.session.findUnique({ where: { id: sha256(token) }, include: { user: true } });
  if (!row) return null;
  if (row.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { id: row.id } }).catch(() => {});
    return null;
  }
  return { user: row.user };
}
const ONE_DAY = 24 * 60 * 60 * 1000;
// Sliding expiry: extend a live session back out to the full window on activity,
// so anyone using the app regularly is never logged out. Skips the DB write when
// the session was renewed within the last day. Returns { expiresAt } or null.
export async function renewSession(token) {
  if (!token) return null;
  const id = sha256(token);
  const row = await prisma.session.findUnique({ where: { id } });
  if (!row) return null;
  const now = Date.now();
  if (row.expiresAt.getTime() < now) {
    await prisma.session.delete({ where: { id } }).catch(() => {});
    return null;
  }
  if (row.expiresAt.getTime() - now > THIRTY_DAYS - ONE_DAY) return { expiresAt: row.expiresAt };
  const expiresAt = new Date(now + THIRTY_DAYS);
  await prisma.session.update({ where: { id }, data: { expiresAt } }).catch(() => {});
  return { expiresAt };
}

export async function invalidateSession(token) {
  if (!token) return;
  await prisma.session.delete({ where: { id: sha256(token) } }).catch(() => {});
}
