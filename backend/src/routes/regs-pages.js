import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { currentZones } from "../regs/sync.js";
import { REACH_REGS } from "../../../lib/regs-reaches.js";
import { seasonWindows, inWindows, windowsLabel } from "../../../lib/regs-season.js";
import { REGS_BASE, zoneUrl, textFragmentUrl, zoneCorpus } from "../../../lib/regs-parse.js";
import { speciesSectionUrl } from "../../../lib/regs-status.js";
import { page, esc, SITE_URL, BRAND, APP_URL } from "../../../lib/site-shell.js";

// Public, crawlable pages for each Fisheries Management Zone, rendered from the
// official Ontario Fishing Regulations Summary that the backend syncs twice a day
// (src/regs/sync.js). Served on muddyyorkfishing.ca/regulations/ via Netlify.

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
// The app's curated river sections (same data the SEO pages are built from).
const RIVERS = (() => {
  try {
    const src = fs.readFileSync(path.join(ROOT, "source-app.jsx"), "utf8");
    const a = src.indexOf("const RIVERS = [") + "const RIVERS = ".length, b = src.indexOf("\n];", a) + 2;
    const C = new Proxy({}, { get: () => "" }); // eslint-disable-line no-unused-vars
    return eval("(" + src.slice(a, b) + ")");
  } catch { return []; }
})();
const riversInZone = (z) => RIVERS.filter((r) => REACH_REGS[r.id] && REACH_REGS[r.id].zone === z);
const riverHref = (r) => `/rivers/${slug(r.river + " " + r.section)}/`;
const YEAR = () => new Date().getFullYear();
const fmtDate = (d) => new Date(d).toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric", timeZone: "America/Toronto" });

const CSS = `<style>
.regs-table{width:100%;border-collapse:collapse;margin:14px 0 6px;font-size:14.5px;}
.regs-table th,.regs-table td{text-align:left;padding:9px 8px;border-bottom:1px solid var(--line);vertical-align:top;}
.regs-table th{font-size:12px;text-transform:uppercase;letter-spacing:.5px;color:var(--dim);}
.st{display:inline-block;font-size:12px;font-weight:700;padding:2px 9px;border-radius:12px;white-space:nowrap;}
.st.open{background:#2C4C3B1a;color:var(--pine);border:1px solid var(--pine);}
.st.closed{background:#8C3B2E14;color:var(--brick);border:1px solid var(--brick);}
.st.check{background:#D4AF3726;color:#6b4f12;border:1px solid var(--gold);}
.prose details{background:#fff;border:1px solid var(--line);border-radius:10px;padding:10px 14px;margin:8px 0;}
.prose details summary{font-weight:700;color:var(--pine);cursor:pointer;}
.prose details li{margin:4px 0;}
.zone-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin:16px 0;}
.zone-grid a{display:block;background:#fff;border:1px solid var(--line);border-radius:10px;padding:12px;text-decoration:none;color:var(--pine);font-weight:700;}
.zone-grid a span{display:block;font-weight:400;color:var(--dim);font-size:13px;margin-top:2px;}
.src{font-size:13px;color:var(--dim);}
@media(max-width:600px){.regs-table .lim{display:none;}}
</style>`;

const cta = (h, p) => `<div class="callout"><h3>${h}</h3><p style="color:var(--dim);margin-bottom:14px;">${p}</p><a class="btn primary" href="${APP_URL}">Start your free 7-day trial</a></div>`;

function stateOf(season, now) {
  const w = seasonWindows(season, now.getFullYear());
  if (w == null) return { cls: "check", label: "Check" };
  return inWindows(now, w) ? { cls: "open", label: "Open today" } : { cls: "closed", label: "Closed today" };
}

function zonePage(z, p, checkedAt, now) {
  const corpus = zoneCorpus(p);
  const species = p.zoneWide.filter((x) => x.season || x.limits);
  const rows = species.map((x) => {
    const st = x.season ? stateOf(x.season, now) : { cls: "check", label: "See limits" };
    const lbl = x.season ? windowsLabel(seasonWindows(x.season, now.getFullYear())) : null;
    return `<tr><td><a href="${esc(speciesSectionUrl(z, x.species, (x.lines[0] || "").split(/[\s:]/)[0]))}" rel="nofollow">${esc(x.species)}</a></td>
<td>${esc(x.season || "See the official summary")}${lbl && !/all year/i.test(x.season || "") ? `<br><span class="src">${esc(lbl)} in ${now.getFullYear()}</span>` : ""}</td>
<td class="lim">${esc(x.limits || "")}</td><td><span class="st ${st.cls}">${st.label}</span></td></tr>`;
  }).join("");
  const trout = species.find((x) => /^brook trout$/i.test(x.species)) || species.find((x) => /^brown trout$/i.test(x.species));
  const rivers = riversInZone(z);
  const link = (text) => textFragmentUrl(p.url, text, corpus);
  const spx = p.speciesExceptions.filter((g) => g.waters.length);
  const exceptions = `
${spx.length ? `<h2>Species exceptions in Zone ${z}</h2>
<p>These waters have different seasons or limits for the species named. They override the zone-wide rules above.</p>
${spx.map((g) => `<details><summary>${esc(g.species)}: ${esc(g.season || "see official entry")} (${g.waters.length} water${g.waters.length > 1 ? "s" : ""})</summary>
${g.limits ? `<p><b>Limits:</b> ${esc(g.limits)}</p>` : ""}<ul>${g.waters.map((w) => `<li><a href="${esc(link(w.text))}" rel="nofollow">${esc(w.text)}</a></li>`).join("")}</ul></details>`).join("")}` : ""}
${p.waterbody.length ? `<h2>Waterbody exceptions in Zone ${z}</h2>
<p>Lakes and rivers with their own rules, in the official wording.</p>
${p.waterbody.map((e) => `<details><summary>${esc(e.name)}</summary><p><a href="${esc(link(e.text))}" rel="nofollow">${esc(e.text)}</a></p>${e.rules.length ? `<ul>${e.rules.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>` : ""}</details>`).join("")}` : ""}
${p.sanctuaries.length ? `<h2>Fish sanctuaries in Zone ${z}</h2>
<p>No fishing is allowed in these places during the periods shown.</p>
${p.sanctuaries.map((s) => `<details><summary>${esc(s.period)} (${s.waters.length})</summary><ul>${s.waters.map((w) => `<li>${esc(w.text)}</li>`).join("")}</ul></details>`).join("")}` : ""}`;

  const faqs = [
    trout && trout.season && { q: `When does trout season open in Zone ${z}?`, a: `Zone-wide, ${trout.species.toLowerCase()} season is ${trout.season}${windowsLabel(seasonWindows(trout.season, now.getFullYear())) && !/all year/i.test(trout.season) ? ` (${windowsLabel(seasonWindows(trout.season, now.getFullYear()))} in ${now.getFullYear()})` : ""}. Some rivers have species exceptions or sanctuaries listed on this page that change this.` },
    { q: `Can I fish in Zone ${z} right now?`, a: `The table above shows which species are open today under the zone-wide seasons. A specific river or lake may differ, so check its species exceptions, waterbody exceptions and sanctuaries below before you go.` },
    { q: "Do I need a fishing licence in Ontario?", a: "Most anglers need an Outdoors Card and a valid fishing licence (sport or conservation). Some people are exempt, such as Ontario residents under 18 or 65 and over. Check the official licensing rules for your situation." },
    { q: `How do I know if a river is in Zone ${z}?`, a: `Ontario's Fisheries Management Zones are mapped on Fish ON-Line and in the official summary. River mouths on the Great Lakes are often in a different zone from the rest of the river.` },
  ].filter(Boolean);

  const body = `
<div class="wrap"><div class="crumbs"><a href="/fishing/">Home</a> › <a href="/regulations/">Regulations</a> › Zone ${z}</div></div>
<section class="section" style="padding-top:14px;"><div class="wrap"><article class="prose">
<h1>Zone ${z} fishing regulations (FMZ ${z})</h1>
<p class="meta">Seasons, limits, exceptions and sanctuaries for Ontario Fisheries Management Zone ${z}, from the official Ontario Fishing Regulations Summary. Last checked ${esc(fmtDate(checkedAt))}.</p>
${p.general.filter((g) => !/^refer to\b/i.test(g) && g.length > 40).slice(0, 3).map((g) => `<p>${esc(g)}</p>`).join("")}
<h2>Zone-wide seasons and limits in FMZ ${z}</h2>
<p>These apply to every water in the zone unless a species exception, waterbody exception or sanctuary below says otherwise. "S" is the sport fishing licence limit and "C" the conservation licence limit.</p>
<table class="regs-table"><thead><tr><th>Species</th><th>Season</th><th class="lim">Limits</th><th>Today</th></tr></thead><tbody>${rows}</tbody></table>
<p class="src">Source: <a href="${esc(zoneUrl(z))}" rel="nofollow">Ontario Fishing Regulations Summary, Zone ${z}</a> on ontario.ca. The summary is Ontario's guide to the regulations made under the Fisheries Act.</p>
${rivers.length ? `<h2>Rivers we cover in Zone ${z}</h2><p>Each river guide shows the official season for every stretch and whether it's open today.</p>
<div class="zone-grid">${rivers.map((r) => `<a href="${riverHref(r)}">${esc(r.river)}<span>${esc(r.section)}</span></a>`).join("")}</div>` : ""}
${cta("Know what's open before you drive", `${BRAND} shows the official season for every stretch of 30+ Southern Ontario rivers, with today's conditions and the fly to use.`)}
${exceptions}
<h2>Frequently asked</h2>
${faqs.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("")}
<p style="margin-top:18px;"><a href="/regulations/">All Ontario fishing zones →</a> · <a href="/rivers/">Southern Ontario river guides →</a> · <a href="/salmon-run/">Ontario salmon run →</a></p>
</article></div></section>`;
  return page({
    title: `Zone ${z} Fishing Regulations ${YEAR()}: Seasons & Limits`,
    description: `Official FMZ ${z} fishing seasons, limits, exceptions and sanctuaries for ${YEAR()}, with which species are open today. Checked against ontario.ca daily.`,
    canonical: `${SITE_URL}/regulations/zone-${z}/`, body, extraHead: CSS,
    schema: { "@context": "https://schema.org", "@type": "Article", headline: `Zone ${z} fishing regulations (FMZ ${z})`, dateModified: new Date(checkedAt).toISOString(),
      mainEntityOfPage: `${SITE_URL}/regulations/zone-${z}/`, publisher: { "@type": "Organization", name: BRAND, url: SITE_URL } },
  });
}

function indexPage(zones, checkedAt) {
  const featured = [16, 17, 20, 13, 14, 19, 15];
  const card = (z) => { const n = riversInZone(z).length; return `<a href="/regulations/zone-${z}/">Zone ${z}<span>${n ? `${n} river guide${n > 1 ? "s" : ""}` : "Seasons and limits"}</span></a>`; };
  const body = `
<div class="wrap"><div class="crumbs"><a href="/fishing/">Home</a> › Regulations</div></div>
<section class="section" style="padding-top:14px;"><div class="wrap"><article class="prose">
<h1>Ontario fishing regulations ${YEAR()} by zone</h1>
<p class="meta">Every Fisheries Management Zone, from the official Ontario Fishing Regulations Summary. Last checked ${esc(fmtDate(checkedAt))}.</p>
<p>Ontario sets fishing seasons and limits by Fisheries Management Zone (FMZ). Each zone has zone-wide rules, then exceptions for particular species and waters, and fish sanctuaries where no fishing is allowed at certain times. Pick your zone to see what's open today.</p>
<h2>Southern Ontario zones</h2>
<p>Most river fishing within two hours of Toronto is in Zone 16 (inland waters from Lake Huron and Georgian Bay to Lake Erie and the western GTA) and Zone 17 (east of Toronto, including Durham Region and Port Hope). Lake Ontario and the Niagara River below the falls are in Zone 20; Lake Huron is Zone 13 and Georgian Bay is Zone 14.</p>
<div class="zone-grid">${featured.map(card).join("")}</div>
<h2>All zones</h2>
<div class="zone-grid">${Array.from({ length: 20 }, (_, i) => i + 1).filter((z) => zones[z]).map(card).join("")}</div>
${cta("Season status for every stretch", `${BRAND} checks the official summary twice a day and shows whether each river section is open today, with links to the exact rule.`)}
<h2>Frequently asked</h2>
<details><summary>What fishing zone am I in?</summary><p>Use Ontario's Fish ON-Line map or the official zone map. Around Toronto, inland rivers are in Zone 16 and Durham Region rivers are in Zone 17; Lake Ontario itself is Zone 20.</p></details>
<details><summary>When does trout season open in Ontario?</summary><p>In Zones 16 and 17 the zone-wide season for brook and brown trout is the fourth Saturday in April to September 30. Many Great Lakes tributaries have extended or year-round seasons for steelhead and salmon, listed as species exceptions on each zone page.</p></details>
<details><summary>Where do these rules come from?</summary><p>From the Ontario Fishing Regulations Summary on ontario.ca, which we check twice a day. The summary is Ontario's guide; the legal regulations are made under the Fisheries Act.</p></details>
<p style="margin-top:18px;"><a href="/rivers/">River guides →</a> · <a href="/salmon-run/">Salmon run guide →</a> · <a href="${REGS_BASE}" rel="nofollow">Official summary on ontario.ca →</a></p>
</article></div></section>`;
  return page({
    title: `Ontario Fishing Regulations ${YEAR()} by Zone (FMZ 1 to 20)`,
    description: `Ontario fishing seasons and limits for every zone, with what's open today. From the official regulations summary, checked twice a day. Start free.`,
    canonical: `${SITE_URL}/regulations/`, body, extraHead: CSS,
  });
}

const noLimit = { config: { rateLimit: false } };
export default async function regsPagesRoutes(app) {
  const send = (reply, html, status = 200) => reply.code(status).header("Content-Type", "text/html; charset=utf-8").header("Cache-Control", "public, max-age=1800").send(html);
  const load = async () => {
    const { zones, rows } = await currentZones();
    const checked = rows.length ? new Date(Math.min(...rows.map((r) => +new Date(r.checkedAt)))) : new Date();
    return { zones, rows, checked };
  };
  const index = async (req, reply) => { const { zones, checked } = await load(); return send(reply, indexPage(zones, checked)); };
  app.get("/regulations", noLimit, index);
  app.get("/regulations/", noLimit, index);
  const zone = async (req, reply) => {
    const z = parseInt(String(req.params.z).replace(/^zone-/, ""), 10);
    const { zones, rows } = await load();
    if (!zones[z]) return reply.redirect("/regulations/", 302);
    const row = rows.find((r) => r.zone === z);
    return send(reply, zonePage(z, zones[z], row ? row.checkedAt : new Date(), new Date()));
  };
  app.get("/regulations/:z", noLimit, zone);
  app.get("/regulations/:z/", noLimit, zone);
}
