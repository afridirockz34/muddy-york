import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "../src/db.js";
import { resetDb } from "./helpers/db.js";

process.env.ADMIN_EMAIL = "boss@muddy.co";
const { buildApp } = await import("../src/app.js");
const app = buildApp();
const cookieName = process.env.SESSION_COOKIE_NAME || "my_session";

async function signup(email, name) {
  const s = await app.inject({ method: "POST", url: "/auth/signup", payload: { email, password: "supersecret1", displayName: name } });
  return { cookies: { [cookieName]: s.cookies.find((c) => c.name === cookieName).value } };
}
const create = (auth, payload) => app.inject({ method: "POST", url: "/api/admin/blog", ...auth, payload });

describe("blog", () => {
  let boss, member;
  beforeEach(async () => {
    await resetDb(); await prisma.blogPost.deleteMany();
    boss = await signup("boss@muddy.co", "boss"); member = await signup("m@b.com", "member");
  });
  afterAll(() => prisma.$disconnect());

  it("only lets the admin write posts", async () => {
    expect((await create(member, { title: "Hi", body: "x" })).statusCode).toBe(403);
    expect((await create({}, { title: "Hi", body: "x" })).statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url: "/api/admin/blog", ...member })).statusCode).toBe(403);
  });

  it("creates a draft with a unique slug, hidden from the public", async () => {
    const a = (await create(boss, { title: "Fall Steelhead on the Credit!", body: "## Go early\n\nTight lines." })).json().post;
    const b = (await create(boss, { title: "Fall Steelhead on the Credit!", body: "Again" })).json().post;
    expect(a.slug).toBe("fall-steelhead-on-the-credit");
    expect(b.slug).toBe("fall-steelhead-on-the-credit-2");
    expect(a.status).toBe("draft");
    expect((await app.inject({ method: "GET", url: `/blog/${a.slug}/` })).statusCode).toBe(404);
    // The admin can preview the draft.
    const prev = await app.inject({ method: "GET", url: `/blog/${a.slug}/?preview=1`, ...boss });
    expect(prev.statusCode).toBe(200);
    expect(prev.body).toContain("Draft preview");
    expect(prev.body).toContain('name="robots" content="noindex"');
  });

  it("publishes a post with SEO markup and lists it", async () => {
    const p = (await create(boss, { title: "Salmon run report", excerpt: "Fish are in.", body: "Chinook are **stacked**.",
      coverUrl: "https://res.cloudinary.com/demo/image/upload/v1/blog/a.jpg", coverAlt: "A chinook", status: "published" })).json().post;
    expect(p.publishedAt).toBeTruthy();
    const page = await app.inject({ method: "GET", url: "/blog/salmon-run-report/" });
    expect(page.statusCode).toBe(200);
    expect(page.headers["content-type"]).toMatch(/text\/html/);
    expect(page.body).toContain("<title>Salmon run report | Muddy York Fishing</title>");
    expect(page.body).toContain('<link rel="canonical" href="https://muddyyorkfishing.ca/blog/salmon-run-report/"/>');
    expect(page.body).toContain('"@type":"BlogPosting"');
    expect(page.body).toContain("/image/upload/f_auto,q_auto,c_limit,w_1400/v1/blog/a.jpg");
    expect(page.body).toContain("Chinook are <strong>stacked</strong>.");
    const index = await app.inject({ method: "GET", url: "/blog" });
    expect(index.body).toContain('href="/blog/salmon-run-report/"');
    expect((await app.inject({ method: "GET", url: "/blog-sitemap.xml" })).body).toContain("<loc>https://muddyyorkfishing.ca/blog/salmon-run-report/</loc>");
    expect((await app.inject({ method: "GET", url: "/blog/feed.xml" })).body).toContain("<title>Salmon run report</title>");
  });

  it("edits and deletes posts", async () => {
    const p = (await create(boss, { title: "Old title", body: "x", status: "published" })).json().post;
    const firstPublished = p.publishedAt;
    const up = await app.inject({ method: "PATCH", url: `/api/admin/blog/${p.id}`, ...boss, payload: { title: "New title", slug: "New Title Here", status: "draft" } });
    expect(up.json().post.slug).toBe("new-title-here");
    expect(up.json().post.publishedAt).toBe(firstPublished); // keeps its original date
    expect((await app.inject({ method: "GET", url: "/blog/new-title-here/" })).statusCode).toBe(404); // unpublished
    expect((await app.inject({ method: "DELETE", url: `/api/admin/blog/${p.id}`, ...member })).statusCode).toBe(403);
    expect((await app.inject({ method: "DELETE", url: `/api/admin/blog/${p.id}`, ...boss })).json().ok).toBe(true);
    expect(await prisma.blogPost.count()).toBe(0);
  });

  it("validates input and escapes what it renders", async () => {
    expect((await create(boss, { title: "", body: "x" })).statusCode).toBe(400);
    expect((await create(boss, { title: "T", body: "x", coverUrl: "javascript:alert(1)" })).statusCode).toBe(400);
    await create(boss, { title: "<script>x</script> tips", body: "<img src=x onerror=alert(1)>", status: "published" });
    const page = await app.inject({ method: "GET", url: "/blog/script-x-script-tips/" });
    expect(page.statusCode).toBe(200);
    expect(page.body).not.toContain("<script>x</script>");
    expect(page.body).not.toContain("<img src=x");
  });
});
