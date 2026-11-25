import { describe, it, expect } from "vitest";
import { contentKey, lastmodFor } from "../marketing/lastmod.mjs";

const pageHtml = (main, shell = "") => `<head>${shell}</head><header class="nav">nav ${shell}</header>${main}<section class="join" data-lazy-bg>join ${shell}</section><script>${shell}</script><footer>foot ${shell}</footer>`;

describe("sitemap lastmod", () => {
  it("ignores changes to the shared shell, scripts and join band", () => {
    expect(contentKey(pageHtml("<h1>Credit</h1>", "a"))).toBe(contentKey(pageHtml("<h1>Credit</h1>", "b")));
    expect(contentKey(pageHtml("<h1>Credit</h1>"))).not.toBe(contentKey(pageHtml("<h1>Credit River</h1>")));
  });
  it("keeps a page's date until its own content changes", () => {
    const store = { "https://x/a/": { key: contentKey(pageHtml("<p>one</p>")), date: "2026-10-01" } };
    expect(lastmodFor(store, "https://x/a/", pageHtml("<p>one</p>", "new shell"))).toBe("2026-10-01");
    expect(lastmodFor(store, "https://x/a/", pageHtml("<p>two</p>"))).not.toBe("2026-10-01");
  });
});
