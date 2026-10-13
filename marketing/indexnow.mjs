// Tell Bing (and other IndexNow engines) which pages changed, so new and
// updated pages reach Bing, and from there ChatGPT search, within hours.
// Run after a deploy:  node marketing/indexnow.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const KEY = "d4fcb34e1f48fc1c06aec7c397fcdb1a";
const host = "muddyyorkfishing.ca";
const own = [...fs.readFileSync(path.join(ROOT, "sitemap.xml"), "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
let blog = [];
try { blog = [...(await (await fetch("https://muddyyorkfishing.ca/blog-sitemap.xml")).text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]); } catch {}
const urlList = [...new Set([...own, ...blog])].slice(0, 10000);
const res = await fetch("https://api.indexnow.org/indexnow", { method: "POST", headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host, key: KEY, keyLocation: `https://${host}/${KEY}.txt`, urlList }) });
console.log("IndexNow", res.status, urlList.length, "urls");
