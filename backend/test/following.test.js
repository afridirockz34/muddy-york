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
  const id = (await app.inject({ method: "GET", url: "/auth/me", ...auth(t) })).json().user.id;
  return { t, id };
}
const post = (t, body) => app.inject({ method: "POST", url: "/posts", ...auth(t), payload: { body } });

describe("following + profiles", () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  it("follow is idempotent, notifies once, and can't follow yourself", async () => {
    const a = await named("a@b.com", "Ay");
    const b = await named("b@b.com", "Bee");
    expect((await app.inject({ method: "POST", url: `/users/${a.id}/follow`, ...auth(a.t) })).statusCode).toBe(400);
    await app.inject({ method: "POST", url: `/users/${b.id}/follow`, ...auth(a.t) });
    await app.inject({ method: "POST", url: `/users/${b.id}/follow`, ...auth(a.t) }); // repeat
    const n = (await app.inject({ method: "GET", url: "/notifications", ...auth(b.t) })).json();
    expect(n.unread).toBe(1);
    expect(n.notifications[0]).toMatchObject({ type: "follow", actorName: "Ay", actorId: a.id });
  });

  it("profile returns counts, isFollowing, and recent posts", async () => {
    const a = await named("a2@b.com", "Ay2");
    const b = await named("b2@b.com", "Bee2");
    await post(b.t, "hello");
    await app.inject({ method: "POST", url: `/users/${b.id}/follow`, ...auth(a.t) });
    const prof = (await app.inject({ method: "GET", url: `/users/${b.id}/profile`, ...auth(a.t) })).json();
    expect(prof.profile).toMatchObject({ displayName: "Bee2", postCount: 1, followerCount: 1, isFollowing: true, isMe: false });
    expect(prof.posts[0].body).toBe("hello");
  });

  it("the following feed shows only followed anglers' posts", async () => {
    const a = await named("a3@b.com", "Ay3");
    const b = await named("b3@b.com", "Bee3");
    const c = await named("c3@b.com", "Cee3");
    await post(b.t, "from B");
    await post(c.t, "from C");
    await app.inject({ method: "POST", url: `/users/${b.id}/follow`, ...auth(a.t) });
    const feed = (await app.inject({ method: "GET", url: "/posts?following=1", ...auth(a.t) })).json();
    expect(feed.posts.map((p) => p.body)).toEqual(["from B"]);
    // unfollow clears it
    await app.inject({ method: "DELETE", url: `/users/${b.id}/follow`, ...auth(a.t) });
    expect((await app.inject({ method: "GET", url: "/posts?following=1", ...auth(a.t) })).json().posts).toHaveLength(0);
  });

  it("following feed is empty when signed out", async () => {
    const r = await app.inject({ method: "GET", url: "/posts?following=1" });
    expect(r.json().posts).toEqual([]);
  });
});
