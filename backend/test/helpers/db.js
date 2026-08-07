import { prisma } from "../../src/db.js";
export async function resetDb() {
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
}
