import { prisma } from "../../src/db.js";
export async function resetDb() {
  await prisma.session.deleteMany();
  await prisma.event.deleteMany(); // not cascade-linked to User
  await prisma.user.deleteMany();  // cascades to posts, notes, catches, follows, notifications, …
}
