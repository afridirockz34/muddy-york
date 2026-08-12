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
const sub = (endpoint) => ({ endpoint, keys: { p256dh: "p256key", auth: "authkey" } });

describe("push routes", () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  it("exposes the VAPID public key publicly", async () => {
    const res = await app.inject({ method: "GET", url: "/push/config" });
    expect(res.statusCode).toBe(200);
    expect(res.json().publicKey).toBeTruthy();
  });

  it("401s subscribe when unauthenticated", async () => {
    const res = await app.inject({ method: "POST", url: "/push/subscribe", payload: sub("https://x/1") });
    expect(res.statusCode).toBe(401);
  });

  it("stores a subscription and upserts idempotently on endpoint", async () => {
    const t = await signup("p@b.com");
    await app.inject({ method: "POST", url: "/push/subscribe", ...auth(t), payload: sub("https://push/abc") });
    await app.inject({ method: "POST", url: "/push/subscribe", ...auth(t), payload: sub("https://push/abc") });
    expect(await prisma.pushSubscription.count({ where: { endpoint: "https://push/abc" } })).toBe(1);
  });

  it("rejects a malformed subscription", async () => {
    const t = await signup("m@b.com");
    const res = await app.inject({ method: "POST", url: "/push/subscribe", ...auth(t), payload: { endpoint: "https://x" } });
    expect(res.statusCode).toBe(400);
  });

  it("unsubscribe removes the caller's subscription", async () => {
    const t = await signup("u@b.com");
    await app.inject({ method: "POST", url: "/push/subscribe", ...auth(t), payload: sub("https://push/gone") });
    await app.inject({ method: "POST", url: "/push/unsubscribe", ...auth(t), payload: { endpoint: "https://push/gone" } });
    expect(await prisma.pushSubscription.count({ where: { endpoint: "https://push/gone" } })).toBe(0);
  });
});

describe("sendPushToUser", () => {
  beforeEach(resetDb);

  it("sends to each subscription and prunes dead endpoints (410)", async () => {
    const { sendPushToUser } = await import("../src/push/sender.js");
    const s = await signup("s@b.com");
    const me = (await app.inject({ method: "GET", url: "/auth/me", ...auth(s) })).json().user;
    await app.inject({ method: "POST", url: "/push/subscribe", ...auth(s), payload: sub("https://live/1") });
    await app.inject({ method: "POST", url: "/push/subscribe", ...auth(s), payload: sub("https://dead/1") });
    const sent = [];
    const send = (sb) => { if (sb.endpoint.includes("dead")) return Promise.reject({ statusCode: 410 }); sent.push(sb.endpoint); return Promise.resolve(); };
    const ok = await sendPushToUser(me.id, { title: "t", body: "b" }, { send });
    expect(ok).toBe(true);
    expect(sent).toEqual(["https://live/1"]);
    // dead endpoint pruned
    expect(await prisma.pushSubscription.count({ where: { endpoint: "https://dead/1" } })).toBe(0);
    expect(await prisma.pushSubscription.count({ where: { endpoint: "https://live/1" } })).toBe(1);
  });
});
