// One-off: date each page's current content from git history, so the first
// sitemap with <lastmod> reflects real edits. Walks back through a page's
// commits while its content stayed the same.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { contentKey, readStore, today } from "./lastmod.mjs";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const FILE = path.join(ROOT, "marketing", "seo-data", "lastmod.json");
const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8", maxBuffer: 64e6 });
const store = readStore(FILE);
const urls = [...fs.readFileSync(path.join(ROOT, "sitemap.xml"), "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
for (const url of urls) {
  const rel = new URL(url).pathname.replace(/^\//, "") + "index.html";
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) continue;
  const key = contentKey(fs.readFileSync(file, "utf8"));
  let date = today();
  const log = git("log", "--format=%H %cs", "--", rel).trim().split("\n").filter(Boolean);
  for (const line of log) {
    const [sha, d] = line.split(" ");
    let old; try { old = git("show", `${sha}:${rel}`); } catch { break; }
    if (contentKey(old) !== key) break;
    date = d;
  }
  store[url] = { key, date };
}
fs.writeFileSync(FILE, JSON.stringify(store, null, 1) + "\n");
console.log("seeded", Object.keys(store).length);
