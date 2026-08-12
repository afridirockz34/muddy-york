import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "../src/db.js";
import { resetDb } from "./helpers/db.js";

// Admin is matched by ADMIN_EMAIL; set it before the app/config load.
process.env.ADMIN_EMAIL = "boss@muddy.co";

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
async function makePost(t, body = "post") {
  return (await app.inject({ method: "POST", url: "/posts", ...auth(t), payload: { body } })).json().post;
}

describe("comments", () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  it("requires displayName + non-empty body; lists public oldest-first", async () => {
    const author = await named("a@b.com", "Author");
    const post = await makePost(author);
    const noName = await signup("nn@b.com");
    expect((await app.inject({ method: "POST", url: `/posts/${post.id}/comments`, ...auth(noName), payload: { body: "hi" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: `/posts/${post.id}/comments`, ...auth(author), payload: { body: "  " } })).statusCode).toBe(400);
    await app.inject({ method: "POST", url: `/posts/${post.id}/comments`, ...auth(author), payload: { body: "first" } });
    await app.inject({ method: "POST", url: `/posts/${post.id}/comments`, ...auth(author), payload: { body: "second" } });
    const g = (await app.inject({ method: "GET", url: `/posts/${post.id}/comments` })).json(); // public
    expect(g.comments.map((c) => c.body)).toEqual(["first", "second"]);
    expect(JSON.stringify(g.comments)).not.toContain("a@b.com");
  });

  it("commentCount appears on the feed and excludes deleted", async () => {
    const t = await named("c@b.com", "C");
    const post = await makePost(t);
    const c1 = (await app.inject({ method: "POST", url: `/posts/${post.id}/comments`, ...auth(t), payload: { body: "x" } })).json().comment;
    await app.inject({ method: "POST", url: `/posts/${post.id}/comments`, ...auth(t), payload: { body: "y" } });
    let feed = (await app.inject({ method: "GET", url: "/posts" })).json();
    expect(feed.posts[0].commentCount).toBe(2);
    await app.inject({ method: "DELETE", url: `/comments/${c1.id}`, ...auth(t) });
    feed = (await app.inject({ method: "GET", url: "/posts" })).json();
    expect(feed.posts[0].commentCount).toBe(1);
  });

  it("delete comment is own-only for non-admins", async () => {
    const author = await named("o@b.com", "Owner");
    const post = await makePost(author);
    const comment = (await app.inject({ method: "POST", url: `/posts/${post.id}/comments`, ...auth(author), payload: { body: "mine" } })).json().comment;
    const other = await named("x@b.com", "Other");
    await app.inject({ method: "DELETE", url: `/comments/${comment.id}`, ...auth(other) }); // no-op
    expect((await app.inject({ method: "GET", url: `/posts/${post.id}/comments` })).json().comments).toHaveLength(1);
  });
});

describe("blocking (symmetric)", () => {
  beforeEach(resetDb);

  it("hides posts and comments both directions and can't self-block", async () => {
    const a = await named("aa@b.com", "A");
    const b = await named("bb@b.com", "B");
    const aId = (await app.inject({ method: "GET", url: "/auth/me", ...auth(a) })).json().user.id;
    const bId = (await app.inject({ method: "GET", url: "/auth/me", ...auth(b) })).json().user.id;
    await makePost(a, "from A");
    await makePost(b, "from B");
    expect((await app.inject({ method: "POST", url: `/users/${aId}/block`, ...auth(a) })).statusCode).toBe(400); // self-block
    await app.inject({ method: "POST", url: `/users/${bId}/block`, ...auth(a) }); // A blocks B
    const aFeed = (await app.inject({ method: "GET", url: "/posts", ...auth(a) })).json();
    const bFeed = (await app.inject({ method: "GET", url: "/posts", ...auth(b) })).json();
    expect(aFeed.posts.map((p) => p.body)).toEqual(["from A"]); // A doesn't see B
    expect(bFeed.posts.map((p) => p.body)).toEqual(["from B"]); // B doesn't see A (symmetric)
    // signed-out still sees both
    expect((await app.inject({ method: "GET", url: "/posts" })).json().posts).toHaveLength(2);
  });

  it("block is idempotent and unblock restores visibility", async () => {
    const a = await named("a2@b.com", "A2");
    const b = await named("b2@b.com", "B2");
    const bId = (await app.inject({ method: "GET", url: "/auth/me", ...auth(b) })).json().user.id;
    await makePost(b, "hi");
    await app.inject({ method: "POST", url: `/users/${bId}/block`, ...auth(a) });
    await app.inject({ method: "POST", url: `/users/${bId}/block`, ...auth(a) }); // idempotent
    expect((await app.inject({ method: "GET", url: "/posts", ...auth(a) })).json().posts).toHaveLength(0);
    await app.inject({ method: "DELETE", url: `/users/${bId}/block`, ...auth(a) });
    expect((await app.inject({ method: "GET", url: "/posts", ...auth(a) })).json().posts).toHaveLength(1);
  });
});

describe("admin moderation", () => {
  beforeEach(resetDb);

  it("admin can delete any post and comment; /auth/me exposes isAdmin", async () => {
    const admin = await named("boss@muddy.co", "Boss");
    const user = await named("u@b.com", "User");
    expect((await app.inject({ method: "GET", url: "/auth/me", ...auth(admin) })).json().isAdmin).toBe(true);
    expect((await app.inject({ method: "GET", url: "/auth/me", ...auth(user) })).json().isAdmin).toBe(false);
    const post = await makePost(user, "spam");
    const comment = (await app.inject({ method: "POST", url: `/posts/${post.id}/comments`, ...auth(user), payload: { body: "spam" } })).json().comment;
    await app.inject({ method: "DELETE", url: `/comments/${comment.id}`, ...auth(admin) });
    await app.inject({ method: "DELETE", url: `/posts/${post.id}`, ...auth(admin) });
    expect((await app.inject({ method: "GET", url: "/posts" })).json().posts).toHaveLength(0);
  });
});
