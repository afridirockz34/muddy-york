import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "../src/db.js";
import { resetDb } from "./helpers/db.js";

const { buildApp } = await import("../src/app.js");
const app = buildApp();
const cookieName = process.env.SESSION_COOKIE_NAME || "my_session";

async function signup(email) {
  const s = await app.inject({ method: "POST", url: "/auth/signup", payload: { email, password: "supersecret1" } });
  return s.cookies.find((c) => c.name === cookieName).value;
}
const auth = (t) => ({ cookies: { [cookieName]: t } });
async function named(email, name) {
  const t = await signup(email);
  await app.inject({ method: "PATCH", url: "/me", ...auth(t), payload: { displayName: name } });
  return t;
}

describe("social posts + likes", () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  it("401s mutations when unauthenticated", async () => {
    expect((await app.inject({ method: "POST", url: "/posts", payload: { body: "hi" } })).statusCode).toBe(401);
    expect((await app.inject({ method: "PATCH", url: "/me", payload: { displayName: "x" } })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/posts/x/like" })).statusCode).toBe(401);
  });

  it("requires a display name before posting", async () => {
    const t = await signup("nn@b.com");
    const r = await app.inject({ method: "POST", url: "/posts", ...auth(t), payload: { body: "hello" } });
    expect(r.statusCode).toBe(400);
    await app.inject({ method: "PATCH", url: "/me", ...auth(t), payload: { displayName: "Riverdog" } });
    const r2 = await app.inject({ method: "POST", url: "/posts", ...auth(t), payload: { body: "hello" } });
    expect(r2.statusCode).toBe(200);
    expect(r2.json().post.author.displayName).toBe("Riverdog");
  });

  it("rejects an empty post (no body, no photo)", async () => {
    const t = await named("e@b.com", "Empty");
    const r = await app.inject({ method: "POST", url: "/posts", ...auth(t), payload: { body: "   " } });
    expect(r.statusCode).toBe(400);
  });

  it("feed is public, newest-first, and never leaks email", async () => {
    const t = await named("a@b.com", "Angler A");
    await app.inject({ method: "POST", url: "/posts", ...auth(t), payload: { body: "first" } });
    await app.inject({ method: "POST", url: "/posts", ...auth(t), payload: { body: "second" } });
    const g = (await app.inject({ method: "GET", url: "/posts" })).json(); // no auth
    expect(g.posts.map((p) => p.body)).toEqual(["second", "first"]);
    expect(JSON.stringify(g.posts)).not.toContain("a@b.com");
    expect(g.posts[0].author.displayName).toBe("Angler A");
  });

  it("like is idempotent and unique; unlike removes it", async () => {
    const author = await named("au@b.com", "Author");
    const post = (await app.inject({ method: "POST", url: "/posts", ...auth(author), payload: { body: "p" } })).json().post;
    const liker = await named("lk@b.com", "Liker");
    const l1 = (await app.inject({ method: "POST", url: `/posts/${post.id}/like`, ...auth(liker) })).json();
    const l2 = (await app.inject({ method: "POST", url: `/posts/${post.id}/like`, ...auth(liker) })).json();
    expect(l1.likeCount).toBe(1);
    expect(l2.likeCount).toBe(1); // double-like still 1
    expect(l2.likedByMe).toBe(true);
    const u = (await app.inject({ method: "DELETE", url: `/posts/${post.id}/like`, ...auth(liker) })).json();
    expect(u.likeCount).toBe(0);
    expect(u.likedByMe).toBe(false);
  });

  it("likedByMe reflects the requesting user", async () => {
    const author = await named("a2@b.com", "A2");
    const post = (await app.inject({ method: "POST", url: "/posts", ...auth(author), payload: { body: "p" } })).json().post;
    const liker = await named("l2@b.com", "L2");
    await app.inject({ method: "POST", url: `/posts/${post.id}/like`, ...auth(liker) });
    const asLiker = (await app.inject({ method: "GET", url: "/posts", ...auth(liker) })).json();
    const asAuthor = (await app.inject({ method: "GET", url: "/posts", ...auth(author) })).json();
    expect(asLiker.posts[0].likedByMe).toBe(true);
    expect(asAuthor.posts[0].likedByMe).toBe(false);
    expect(asAuthor.posts[0].likeCount).toBe(1);
  });

  it("delete is own-only and soft (removes from feed)", async () => {
    const owner = await named("o@b.com", "Owner");
    const post = (await app.inject({ method: "POST", url: "/posts", ...auth(owner), payload: { body: "mine" } })).json().post;
    const other = await named("x@b.com", "Other");
    await app.inject({ method: "DELETE", url: `/posts/${post.id}`, ...auth(other) }); // no-op
    expect((await app.inject({ method: "GET", url: "/posts" })).json().posts).toHaveLength(1);
    await app.inject({ method: "DELETE", url: `/posts/${post.id}`, ...auth(owner) });
    expect((await app.inject({ method: "GET", url: "/posts" })).json().posts).toHaveLength(0);
  });

  it("paginates with the before cursor", async () => {
    const t = await named("pg@b.com", "Pager");
    for (const b of ["1", "2", "3"]) await app.inject({ method: "POST", url: "/posts", ...auth(t), payload: { body: b } });
    const page1 = (await app.inject({ method: "GET", url: "/posts?limit=2" })).json();
    expect(page1.posts.map((p) => p.body)).toEqual(["3", "2"]);
    expect(page1.nextBefore).toBeTruthy();
    const page2 = (await app.inject({ method: "GET", url: "/posts?limit=2&before=" + encodeURIComponent(page1.nextBefore) })).json();
    expect(page2.posts.map((p) => p.body)).toEqual(["1"]);
  });

  it("photo-sign 400s when Cloudinary is unconfigured", async () => {
    const t = await named("ph@b.com", "Photog");
    const r = await app.inject({ method: "POST", url: "/posts/photo-sign", ...auth(t) });
    expect(r.statusCode).toBe(400); // no CLOUDINARY_* in test env
  });

  it("report returns ok", async () => {
    const t = await named("rp@b.com", "Reporter");
    const post = (await app.inject({ method: "POST", url: "/posts", ...auth(t), payload: { body: "p" } })).json().post;
    const r = await app.inject({ method: "POST", url: `/posts/${post.id}/report`, ...auth(t), payload: { reason: "spam" } });
    expect(r.statusCode).toBe(200);
    expect(r.json().ok).toBe(true);
  });
});
