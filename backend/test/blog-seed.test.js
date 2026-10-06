import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "../src/db.js";
import { resetDb } from "./helpers/db.js";
import { seedBlogPosts, SEED_POSTS } from "../src/blog/seed-posts.js";
import { markdownText } from "../../lib/markdown.js";

describe("seedBlogPosts", () => {
  beforeEach(async () => { await resetDb(); await prisma.blogPost.deleteMany(); });
  afterAll(() => prisma.$disconnect());

  it("creates missing posts once and never overwrites edits", async () => {
    expect(await seedBlogPosts(prisma)).toBe(SEED_POSTS.length);
    const slug = SEED_POSTS[0].slug;
    await prisma.blogPost.update({ where: { slug }, data: { title: "Edited" } });
    expect(await seedBlogPosts(prisma)).toBe(0);
    expect((await prisma.blogPost.findUnique({ where: { slug } })).title).toBe("Edited");
  });

  it("posts meet the content rules", () => {
    for (const p of SEED_POSTS) {
      const all = p.title + p.excerpt + p.body;
      expect(all, p.slug).not.toMatch(/[—–]/);
      expect(p.excerpt.length, p.slug).toBeGreaterThanOrEqual(70);
      expect(p.excerpt.length, p.slug).toBeLessThanOrEqual(158);
      const words = markdownText(p.body).split(" ").length;
      expect(words, p.slug).toBeGreaterThan(900);
      expect((p.body.match(/\]\(\/[^)]*\)/g) || []).length, p.slug).toBeGreaterThanOrEqual(5);
      expect((p.body.match(/\]\(https:\/\/[^)]*\)/g) || []).length, p.slug).toBeGreaterThanOrEqual(3);
    }
  });
});
