// Sitemap <lastmod>: the date each page's own content last changed, not the
// build date. A page's content is what sits between the site header and the
// footer, without scripts or the shared "join" band, so a change to the
// shared shell doesn't make every page look freshly edited.
import crypto from "node:crypto";
import fs from "node:fs";

export function contentKey(html) {
  const a = html.indexOf("</header>"), b = html.lastIndexOf("<footer");
  const main = html.slice(a < 0 ? 0 : a, b < 0 ? html.length : b)
    .replace(/<section class="join"[\s\S]*?<\/section>/g, "")
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/\s+/g, " ");
  return crypto.createHash("sha1").update(main).digest("hex").slice(0, 16);
}
export const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });

// store: { "<url>": { key, date } }. A page whose content changed gets today.
export function lastmodFor(store, url, html) {
  const key = contentKey(html), cur = store[url];
  if (cur && cur.key === key) return cur.date;
  store[url] = { key, date: today() };
  return store[url].date;
}
export const readStore = (file) => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return {}; } };
