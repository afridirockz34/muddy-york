import { prisma } from "../db.js";
import { sendPushToUser } from "../push/sender.js";

// Record an in-app notification for the post owner and fire a best-effort web
// push. Never notifies a user about their own action.
export async function notify({ recipientId, actorId, actorName, type, postId, preview = "" }) {
  if (!recipientId || recipientId === actorId) return;
  const name = actorName || "An angler";
  await prisma.notification.create({
    data: { userId: recipientId, actorId, actorName: name, type, postId, preview: String(preview).slice(0, 140) },
  }).catch(() => {});
  const title = type === "like" ? "New like on your post" : "New comment on your post";
  const body = type === "like"
    ? `${name} liked your post`
    : `${name} commented: ${String(preview).slice(0, 80)}`;
  sendPushToUser(recipientId, { title, body, url: "/?tab=news" }).catch(() => {});
}
