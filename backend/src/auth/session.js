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
export async function invalidateSession(token) {
  if (!token) return;
  await prisma.session.delete({ where: { id: sha256(token) } }).catch(() => {});
}
