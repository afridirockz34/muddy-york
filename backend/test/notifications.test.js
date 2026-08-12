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
async function makePost(t, body = "post") {
  return (await app.inject({ method: "POST", url: "/posts", ...auth(t), payload: { body } })).json().post;
}

describe("notifications + avatar", () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  it("a like on someone else's post creates a notification for the owner", async () => {
    const owner = await named("o@b.com", "Owner");
    const post = await makePost(owner);
    const liker = await named("l@b.com", "Liker");
    await app.inject({ method: "POST", url: `/posts/${post.id}/like`, ...auth(liker) });
    const n = (await app.inject({ method: "GET", url: "/notifications", ...auth(owner) })).json();
    expect(n.unread).toBe(1);
    expect(n.notifications[0]).toMatchObject({ type: "like", actorName: "Liker", postId: post.id });
  });

  it("does not notify on a repeat like or on your own like", async () => {
    const owner = await named("o2@b.com", "Owner2");
    const post = await makePost(owner);
    await app.inject({ method: "POST", url: `/posts/${post.id}/like`, ...auth(owner) }); // self-like
    const liker = await named("l2@b.com", "Liker2");
    await app.inject({ method: "POST", url: `/posts/${post.id}/like`, ...auth(liker) });
    await app.inject({ method: "POST", url: `/posts/${post.id}/like`, ...auth(liker) }); // repeat
    const n = (await app.inject({ method: "GET", url: "/notifications", ...auth(owner) })).json();
    expect(n.unread).toBe(1); // only one, from the liker's first like
  });

  it("a comment notifies the owner with a preview; marking read clears unread", async () => {
    const owner = await named("o3@b.com", "Owner3");
    const post = await makePost(owner);
    const other = await named("c@b.com", "Commenter");
    await app.inject({ method: "POST", url: `/posts/${post.id}/comments`, ...auth(other), payload: { body: "nice fish" } });
    let n = (await app.inject({ method: "GET", url: "/notifications", ...auth(owner) })).json();
    expect(n.notifications[0]).toMatchObject({ type: "comment", preview: "nice fish" });
    await app.inject({ method: "POST", url: "/notifications/read", ...auth(owner) });
    n = (await app.inject({ method: "GET", url: "/notifications", ...auth(owner) })).json();
    expect(n.unread).toBe(0);
  });

  it("PATCH /me sets an avatar that appears on the author's posts", async () => {
    const t = await named("a@b.com", "Avatared");
    await app.inject({ method: "PATCH", url: "/me", ...auth(t), payload: { avatarUrl: "https://cdn.example/a.jpg" } });
    const post = await makePost(t);
    expect(post.author.avatarUrl).toBe("https://cdn.example/a.jpg");
    const me = (await app.inject({ method: "GET", url: "/auth/me", ...auth(t) })).json();
    expect(me.user.avatarUrl).toBe("https://cdn.example/a.jpg");
  });
});
