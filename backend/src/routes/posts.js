import { createHash } from "node:crypto";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { getCurrentUser } from "../auth/current-user.js";
import { cloudinarySignature } from "../../../lib/cloudinary-sign.js";
import { sendMail } from "../alerts/mailer.js";
import { isAdmin, blockedIdsFor } from "../social/moderation.js";
import { notify } from "../social/notify.js";

const sha1 = (s) => createHash("sha1").update(s).digest("hex");
const clamp = (s, n) => String(s || "").trim().slice(0, n);

// Shape a Post row + its like info for the public feed. Only displayName is
// ever exposed about the author — never email.
function shapePost(p, meId) {
  const likes = p.likes || [];
  return {
    id: p.id, body: p.body, photoUrl: p.photoUrl, photoW: p.photoW, photoH: p.photoH,
    river: p.river, category: p.category, createdAt: p.createdAt.toISOString(),
    author: { displayName: p.user?.displayName || "An angler", avatarUrl: p.user?.avatarUrl || null },
    authorId: p.userId,
    likeCount: typeof p._count?.likes === "number" ? p._count.likes : likes.length,
    commentCount: typeof p._count?.comments === "number" ? p._count.comments : 0,
    likedByMe: meId ? likes.some((l) => l.userId === meId) : false,
    mine: meId ? p.userId === meId : false,
  };
}

function shapeComment(c, meId, admin) {
  return {
    id: c.id, body: c.body, createdAt: c.createdAt.toISOString(),
    author: { displayName: c.user?.displayName || "An angler", avatarUrl: c.user?.avatarUrl || null },
    authorId: c.userId,
    mine: meId ? c.userId === meId || admin : false,
  };
}

export default async function postRoutes(app) {
  const auth = async (req, reply) => {
    const u = await getCurrentUser(req);
    if (!u) { reply.code(401).send({ error: "sign in first" }); return; }
    req.user = u;
  };

  // Set/update the public display name and/or avatar.
  app.patch("/me", { preHandler: auth }, async (req, reply) => {
    const b = req.body || {};
    const data = {};
    if (b.displayName !== undefined) {
      const name = clamp(b.displayName, 40);
      if (!name) return reply.code(400).send({ error: "display name required" });
      data.displayName = name;
    }
    if (b.avatarUrl !== undefined) data.avatarUrl = b.avatarUrl ? clamp(b.avatarUrl, 500) : null;
    if (!Object.keys(data).length) return reply.code(400).send({ error: "nothing to update" });
    const u = await prisma.user.update({ where: { id: req.user.id }, data });
    return { user: { id: u.id, email: u.email, emailVerified: u.emailVerified, displayName: u.displayName, avatarUrl: u.avatarUrl } };
  });

  // Public diagnostic: is photo upload configured, and what cloud name does the
  // server actually see? (Cloud name is public — it appears in every image URL.)
  app.get("/media/config", async () => ({
    configured: config.cloudinary.configured,
    cloudName: config.cloudinary.cloudName || null,
  }));

  // Cloudinary signed direct-upload params. Secret never leaves the server.
  app.post("/posts/photo-sign", { preHandler: auth }, async (req, reply) => {
    if (!config.cloudinary.configured) return reply.code(400).send({ error: "photo uploads not configured" });
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = config.cloudinary.folder;
    const signature = cloudinarySignature({ folder, timestamp }, config.cloudinary.apiSecret, sha1);
    return { cloudName: config.cloudinary.cloudName, apiKey: config.cloudinary.apiKey, timestamp, folder, signature };
  });

  // Create a post. Requires a display name; needs body or photo.
  app.post("/posts", { preHandler: auth }, async (req, reply) => {
    if (!req.user.displayName) return reply.code(400).send({ error: "set a display name first" });
    const b = req.body || {};
    const body = clamp(b.body, 2000);
    const photoUrl = b.photoUrl ? clamp(b.photoUrl, 500) : null;
    if (!body && !photoUrl) return reply.code(400).send({ error: "write something or add a photo" });
    const int = (v) => (Number.isFinite(+v) ? Math.round(+v) : null);
    const post = await prisma.post.create({
      data: {
        userId: req.user.id, body, photoUrl,
        photoW: photoUrl ? int(b.photoW) : null, photoH: photoUrl ? int(b.photoH) : null,
        river: b.river ? clamp(b.river, 80) : null,
        category: clamp(b.category, 24) || "Report",
      },
      include: { user: true, likes: true },
    });
    return { post: shapePost(post, req.user.id) };
  });

  // Soft-delete a post: owner, or admin (moderation). Idempotent.
  app.delete("/posts/:id", { preHandler: auth }, async (req) => {
    const where = { id: req.params.id, deletedAt: null };
    if (!isAdmin(req.user)) where.userId = req.user.id; // non-admins: own only
    await prisma.post.updateMany({ where, data: { deletedAt: new Date() } });
    return { ok: true };
  });

  // Like / unlike. Both idempotent; return the fresh count + likedByMe.
  const likeCounts = async (postId, meId) => {
    const [likeCount, mine] = await Promise.all([
      prisma.like.count({ where: { postId } }),
      prisma.like.findUnique({ where: { postId_userId: { postId, userId: meId } } }),
    ]);
    return { likeCount, likedByMe: !!mine };
  };
  app.post("/posts/:id/like", { preHandler: auth }, async (req, reply) => {
    const post = await prisma.post.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!post) return reply.code(404).send({ error: "post not found" });
    const already = await prisma.like.findUnique({ where: { postId_userId: { postId: post.id, userId: req.user.id } } });
    await prisma.like.upsert({
      where: { postId_userId: { postId: post.id, userId: req.user.id } },
      create: { postId: post.id, userId: req.user.id },
      update: {},
    });
    // Notify the owner only on a genuinely new like (not repeat taps).
    if (!already) notify({ recipientId: post.userId, actorId: req.user.id, actorName: req.user.displayName, type: "like", postId: post.id });
    return likeCounts(post.id, req.user.id);
  });
  app.delete("/posts/:id/like", { preHandler: auth }, async (req) => {
    await prisma.like.deleteMany({ where: { postId: req.params.id, userId: req.user.id } });
    return likeCounts(req.params.id, req.user.id);
  });

  // Report a post to the admin (email only; no persistence).
  app.post("/posts/:id/report", { preHandler: auth }, async (req) => {
    const reason = clamp(req.body?.reason, 500);
    if (config.resend.adminEmail) {
      await sendMail({
        to: config.resend.adminEmail,
        subject: `Post reported: ${req.params.id}`,
        text: `Post ${req.params.id} was reported by ${req.user.email}.${reason ? "\n\nReason: " + reason : ""}`,
      }).catch(() => {});
    }
    return { ok: true };
  });

  // Public feed, newest first, cursor by createdAt. Signed-in requesters don't
  // see posts from anyone in a block relationship with them (either direction).
  app.get("/posts", async (req) => {
    const me = await getCurrentUser(req);
    const before = req.query?.before ? new Date(req.query.before) : null;
    const limit = Math.min(50, Math.max(1, parseInt(req.query?.limit, 10) || 20));
    const where = { deletedAt: null };
    if (before && !Number.isNaN(before.getTime())) where.createdAt = { lt: before };
    if (me) {
      const blocked = await blockedIdsFor(me.id);
      if (blocked.length) where.userId = { notIn: blocked };
    }
    const rows = await prisma.post.findMany({
      where, orderBy: { createdAt: "desc" }, take: limit,
      include: {
        user: true,
        likes: me ? { where: { userId: me.id } } : false,
        _count: { select: { likes: true, comments: { where: { deletedAt: null } } } },
      },
    });
    const posts = rows.map((p) => shapePost(p, me?.id));
    const nextBefore = rows.length === limit ? rows[rows.length - 1].createdAt.toISOString() : null;
    return { posts, nextBefore };
  });

  // ---- Comments ----
  app.post("/posts/:id/comments", { preHandler: auth }, async (req, reply) => {
    if (!req.user.displayName) return reply.code(400).send({ error: "set a display name first" });
    const body = clamp(req.body?.body, 1000);
    if (!body) return reply.code(400).send({ error: "write a comment" });
    const post = await prisma.post.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!post) return reply.code(404).send({ error: "post not found" });
    const c = await prisma.comment.create({
      data: { postId: post.id, userId: req.user.id, body },
      include: { user: true },
    });
    notify({ recipientId: post.userId, actorId: req.user.id, actorName: req.user.displayName, type: "comment", postId: post.id, preview: body });
    return { comment: shapeComment(c, req.user.id, false) };
  });

  app.get("/posts/:id/comments", async (req) => {
    const me = await getCurrentUser(req);
    const where = { postId: req.params.id, deletedAt: null };
    if (me) {
      const blocked = await blockedIdsFor(me.id);
      if (blocked.length) where.userId = { notIn: blocked };
    }
    const rows = await prisma.comment.findMany({ where, orderBy: { createdAt: "asc" }, take: 500, include: { user: true } });
    const admin = isAdmin(me);
    return { comments: rows.map((c) => shapeComment(c, me?.id, admin)) };
  });

  app.delete("/comments/:id", { preHandler: auth }, async (req) => {
    const where = { id: req.params.id, deletedAt: null };
    if (!isAdmin(req.user)) where.userId = req.user.id;
    await prisma.comment.updateMany({ where, data: { deletedAt: new Date() } });
    return { ok: true };
  });

  // ---- Blocking (symmetric hide) ----
  app.post("/users/:id/block", { preHandler: auth }, async (req, reply) => {
    if (req.params.id === req.user.id) return reply.code(400).send({ error: "you can't block yourself" });
    await prisma.block.upsert({
      where: { blockerId_blockedId: { blockerId: req.user.id, blockedId: req.params.id } },
      create: { blockerId: req.user.id, blockedId: req.params.id },
      update: {},
    });
    return { ok: true };
  });
  app.delete("/users/:id/block", { preHandler: auth }, async (req) => {
    await prisma.block.deleteMany({ where: { blockerId: req.user.id, blockedId: req.params.id } });
    return { ok: true };
  });
  // ---- Notifications (likes/comments on your posts) ----
  app.get("/notifications", { preHandler: auth }, async (req) => {
    const [rows, unread] = await Promise.all([
      prisma.notification.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: "desc" }, take: 30 }),
      prisma.notification.count({ where: { userId: req.user.id, read: false } }),
    ]);
    return {
      unread,
      notifications: rows.map((n) => ({
        id: n.id, type: n.type, actorName: n.actorName, postId: n.postId,
        preview: n.preview, read: n.read, createdAt: n.createdAt.toISOString(),
      })),
    };
  });
  app.post("/notifications/read", { preHandler: auth }, async (req) => {
    await prisma.notification.updateMany({ where: { userId: req.user.id, read: false }, data: { read: true } });
    return { ok: true };
  });

  app.get("/users/blocked", { preHandler: auth }, async (req) => {
    const rows = await prisma.block.findMany({
      where: { blockerId: req.user.id },
      include: { blocked: true },
      orderBy: { createdAt: "desc" },
    });
    return { blocked: rows.map((r) => ({ id: r.blockedId, displayName: r.blocked?.displayName || "An angler" })) };
  });
}
