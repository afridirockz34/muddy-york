// Mechanical quality check for the generated public pages, against the rules in
// marketing/client-profile.md: title and description length, one H1, word count,
// internal links, FAQ count, no em dashes, no banned phrases. Run after
// `npm run build:seo`:  node marketing/check-pages.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const profile = fs.readFileSync(path.join(ROOT, "marketing", "client-profile.md"), "utf8");
const banned = (profile.split("## Words and Phrases to Avoid Entirely")[1] || "").split("##")[0]
  .split("\n").map((l) => l.replace(/^-\s*/, "").trim()).filter((l) => l && !/dash/i.test(l)).map((l) => l.toLowerCase());

// Per page type: [min words, max words, min internal links, min FAQ]
const RULES = { river: [800, 1600, 5, 5], salmon: [500, 1500, 4, 4], town: [500, 1300, 5, 4], guide: [400, 2000, 4, 2], region: [300, 2000, 4, 2], other: [0, 99999, 0, 0] };
const typeOf = (p) => p.startsWith("rivers/") && p !== "rivers/" ? "river" : p.startsWith("salmon-run/") ? "salmon"
  : p.startsWith("fishing-spots/") && p !== "fishing-spots/" ? "town" : p.startsWith("guides/") && p !== "guides/" ? "guide"
  : p.startsWith("regions/") && p !== "regions/" ? "region" : "other";

const sitemap = fs.readFileSync(path.join(ROOT, "sitemap.xml"), "utf8");
const pages = [...sitemap.matchAll(/<loc>https:\/\/muddyyorkfishing\.ca\/([^<]*)<\/loc>/g)].map((m) => m[1])
  .filter((p) => p && !p.startsWith("regulations"));
let problems = 0;
const out = [];
for (const p of pages) {
  const file = path.join(ROOT, p, "index.html");
  if (!fs.existsSync(file)) { out.push(`MISSING ${p}`); problems++; continue; }
  const html = fs.readFileSync(file, "utf8");
  const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || "";
  const desc = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || "";
  const main = html.split(/<header class="nav">/)[1]?.split(/<footer>/)[0] || "";
  const text = main.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/g, " ");
  const words = text.split(/\s+/).filter((w) => /[a-z0-9]/i.test(w)).length;
  const h1 = (main.match(/<h1[\s>]/g) || []).length;
  const links = (main.match(/href="\/(?!\/)[^"]*"/g) || []).filter((h) => !/href="\/"$/.test(h)).length;
  const faqs = (main.match(/<details>/g) || []).length;
  const decode = (s) => s.replace(/&amp;/g, "&").replace(/&#39;/g, "'");
  const t = typeOf(p), [wMin, wMax, lMin, fMin] = RULES[t];
  const issues = [];
  if (decode(title).length > 60) issues.push(`title ${decode(title).length} chars`);
  if (decode(desc).length > 160 || decode(desc).length < 70) issues.push(`description ${decode(desc).length} chars`);
  if (h1 !== 1) issues.push(`${h1} H1s`);
  if (/[—–]/.test(title + desc + text)) issues.push("em/en dash in copy");
  if (t !== "other" && (words < wMin || words > wMax)) issues.push(`${words} words (want ${wMin}-${wMax})`);
  if (links < lMin) issues.push(`${links} internal links (want ${lMin}+)`);
  if (faqs < fMin) issues.push(`${faqs} FAQs (want ${fMin}+)`);
  const lower = text.toLowerCase();
  for (const b of banned) if (lower.includes(b)) issues.push(`banned phrase "${b}"`);
  if (issues.length) { problems++; out.push(`✗ /${p}  [${t}] ${issues.join("; ")}`); }
}
console.log(out.join("\n") || "");
console.log(`${pages.length} pages checked, ${problems} with issues`);
process.exit(problems ? 1 : 0);
