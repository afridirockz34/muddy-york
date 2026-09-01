// Static marketing/SEO site generator for Muddy York Fishing.
// Builds: home, rivers index, one guide page per river, sitemap.xml, robots.txt.
// The river data is read from ../source-app.jsx so pages stay in sync with the app.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dir, "..");
// The app owns the root domain (muddyyorkfishing.ca) and is served from the repo
// root by Netlify (publish="."). The SEO pages ship in the SAME deploy at clean
// paths, so we write them into the repo root next to the app.
const OUT = ROOT;

const SITE_URL = "https://muddyyorkfishing.ca";  // root domain (app + these pages)
const APP_URL = "/";                             // the app lives at the root
const HOME = "/fishing/";                        // marketing landing (root is the app)
const BRAND = "Muddy York Fishing";

// ---- pull the RIVERS array out of the app source (plain data, safe to eval) ----
const src = fs.readFileSync(path.join(ROOT, "source-app.jsx"), "utf8");
const arrStart = src.indexOf("const RIVERS = [") + "const RIVERS = ".length;
const arrEnd = src.indexOf("\n];", arrStart) + 2; // include the closing ]
const RIVERS = eval("(" + src.slice(arrStart, arrEnd) + ")");

const SPECIES = { STL: "Steelhead", CHN: "Chinook salmon", COH: "Coho salmon",
  BNTr: "Brown trout (lake-run)", BNT: "Brown trout", RBT: "Rainbow trout", BKT: "Brook trout",
  ATS: "Atlantic salmon", LAT: "Lake trout", SMB: "Smallmouth bass", NP: "Northern pike",
  WAL: "Walleye", PAN: "Panfish" };
// Per-species season + go-to tactic, used to write richer river guides.
const SP_INFO = {
  STL: { season: "spring (Mar–May) and fall through winter (Oct–Feb) on the runs", tactic: "drift eggs, stoneflies and nymphs through runs and tailouts, or swing streamers when the water is stained" },
  CHN: { season: "the fall run (Sept–Oct)", tactic: "swing large bright streamers and spey flies slowly through deep holding pools in the lower river" },
  COH: { season: "fall (Oct–Nov)", tactic: "work bright streamers and egg patterns through lower-river pools and current breaks" },
  BNTr: { season: "spring and fall for lake-run fish", tactic: "fish streamers, eggs and nymphs on dropping, clearing water" },
  BNT: { season: "April–June and September–October (early and late only in summer heat)", tactic: "cover water with a dry-dropper and nymphs in prime temps, and swing streamers at first and last light" },
  RBT: { season: "spring through fall", tactic: "nymph the seams and run a dry-dropper over the riffles" },
  BKT: { season: "late spring and fall in cold headwaters", tactic: "fish small dries, nymphs and tiny streamers on light tippet" },
  ATS: { season: "summer into fall", tactic: "present small wets and nymphs on light tippet in low light — strictly catch-and-release, barbless" },
  LAT: { season: "the cold months near river mouths and deep water", tactic: "work deep, slow streamers and jigs off the main current" },
  SMB: { season: "summer (June–September)", tactic: "throw crayfish and baitfish streamers, and poppers on warm evenings" },
  NP: { season: "spring and fall", tactic: "strip big flashy streamers on a wire or heavy fluorocarbon bite guard" },
  WAL: { season: "spring and fall in low light", tactic: "fish jigs and streamers deep and slow near current breaks" },
  PAN: { season: "spring through summer", tactic: "use small nymphs, wets and poppers on light gear" },
};
// A short read on how a reach fishes, inferred from its water description.
function waterHow(water) {
  const w = (water || "").toLowerCase();
  if (w.includes("tailwater")) return "As a tailwater below a dam, flows and temperatures stay steadier than a freestone — it fishes well when nearby rivers are blown out or too warm, and cold releases can hold trout through summer.";
  if (w.includes("spring") || w.includes("headwater") || w.includes("cold")) return "These cold, spring-fed headwaters run clear and cool. Fish move to the shade and oxygen — approach quietly, downsize your tippet, and read the pocket water.";
  if (w.includes("tributar")) return "A smaller tributary like this warms and clears faster than the main stem, so it fishes first after rain and concentrates migratory fish on a fresh push.";
  if (w.includes("lower") || w.includes("mouth")) return "Down in the lower river near the lake, deep pools, log-jams and current breaks hold migratory fish on a fresh push after rain — first and last light are prime.";
  return "This freestone reach rises and clears with rainfall, so timing is everything: it fishes best on dropping, clearing water a day or two after a rise.";
}
const speciesNames = (keys) => [...new Set((keys || []).map((k) => (SPECIES[k] || k).replace(/\s*\(.*\)$/, "")))];
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ---- shared shell ----
function page({ title, description, canonical, body, schema }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}"/>
<link rel="canonical" href="${canonical}"/>
<meta property="og:type" content="website"/>
<meta property="og:title" content="${esc(title)}"/>
<meta property="og:description" content="${esc(description)}"/>
<meta property="og:url" content="${canonical}"/>
<meta property="og:image" content="${SITE_URL}/crest.png"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="theme-color" content="#2C4C3B"/>
<link rel="icon" type="image/png" href="/crest.png"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700;800&family=Public+Sans:wght@400;600;700&display=swap" rel="stylesheet"/>
<style>
:root{--pine:#2C4C3B;--ink:#1B2A20;--gold:#D4AF37;--brass:#A8862A;--brick:#8C3B2E;--cream:#F4EFE6;--panel:#FBF7EF;--line:#DED6C4;--text:#2A2A2A;--dim:#5C5A4E;}
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:"Public Sans",system-ui,Arial,sans-serif;color:var(--text);background:var(--cream);line-height:1.6;-webkit-font-smoothing:antialiased;}
h1,h2,h3{font-family:"Playfair Display",Georgia,serif;color:var(--pine);line-height:1.2;}
a{color:var(--brick);}
img{max-width:100%;}
.wrap{max-width:1080px;margin:0 auto;padding:0 20px;}
header.nav{position:sticky;top:0;z-index:20;background:var(--pine);border-bottom:3px solid var(--gold);}
.nav .wrap{display:flex;align-items:center;gap:12px;padding:12px 20px;}
.nav a.brand{display:flex;align-items:center;gap:10px;text-decoration:none;}
.nav .brand img{width:38px;height:38px;}
.nav .brand b{font-family:"Playfair Display",serif;font-size:19px;color:#EFE9DB;}
.nav .links{margin-left:auto;display:flex;gap:18px;align-items:center;}
.nav .links a{color:#CBD8C9;text-decoration:none;font-weight:600;font-size:14px;}
.nav .cta{background:var(--brick);color:#fff!important;padding:8px 16px;border-radius:8px;}
.btn{display:inline-block;font-weight:700;text-decoration:none;padding:13px 22px;border-radius:10px;border:1px solid var(--pine);}
.btn.primary{background:var(--brick);border-color:var(--brick);color:#fff;}
.btn.ghost{background:transparent;color:var(--pine);}
.hero{background:var(--pine);color:#EFE9DB;padding:64px 0;}
.hero .wrap{display:grid;grid-template-columns:1.2fr .8fr;gap:32px;align-items:center;}
.hero h1{color:#fff;font-size:42px;font-weight:800;}
.hero p{color:#CBD8C9;font-size:18px;margin:16px 0 24px;}
.hero .art{display:flex;justify-content:center;}
.hero .art img{width:230px;filter:drop-shadow(0 12px 30px rgba(0,0,0,.35));}
.section{padding:56px 0;}
.section.alt{background:var(--panel);}
.section h2{font-size:30px;text-align:center;}
.section .sub{text-align:center;color:var(--dim);max-width:640px;margin:10px auto 0;}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:34px;}
.card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:22px;}
.card h3{font-size:18px;margin-bottom:8px;}
.card p{color:var(--dim);font-size:14.5px;}
.price{display:grid;grid-template-columns:1fr 1fr;gap:18px;max-width:640px;margin:34px auto 0;}
.plan{background:#fff;border:1px solid var(--line);border-radius:16px;padding:26px;text-align:center;}
.plan.best{border:2px solid var(--gold);position:relative;}
.plan .tag{position:absolute;top:-12px;left:50%;transform:translateX(-50%);background:var(--gold);color:#3a2f0a;font-size:11px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;padding:3px 12px;border-radius:20px;}
.plan .amt{font-family:"Playfair Display",serif;font-size:36px;color:var(--pine);font-weight:800;}
.plan .per{color:var(--dim);font-size:14px;}
.rivers-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px;margin-top:28px;}
.river-link{display:block;background:#fff;border:1px solid var(--line);border-radius:12px;padding:15px 16px;text-decoration:none;color:var(--text);}
.river-link b{color:var(--pine);font-family:"Playfair Display",serif;font-size:16px;}
.river-link span{display:block;color:var(--dim);font-size:13px;margin-top:2px;}
.faq{max-width:760px;margin:30px auto 0;}
.faq details{background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px 18px;margin-bottom:10px;}
.faq summary{font-weight:700;color:var(--pine);cursor:pointer;}
.faq p{margin-top:8px;color:var(--dim);}
.crumbs{font-size:13px;color:var(--dim);padding:18px 0 0;}
.crumbs a{color:var(--brass);text-decoration:none;}
.prose{max-width:760px;margin:0 auto;}
.prose h1{font-size:34px;margin:14px 0 6px;}
.prose .meta{color:var(--dim);margin-bottom:20px;}
.prose h2{font-size:23px;margin:28px 0 10px;}
.prose p{margin:10px 0;}
.pill{display:inline-block;background:#fff;border:1px solid var(--line);border-radius:20px;padding:4px 12px;font-size:13px;font-weight:700;color:var(--pine);margin:3px 6px 3px 0;}
.callout{background:var(--panel);border:1px solid var(--gold);border-radius:14px;padding:22px;margin:26px 0;text-align:center;}
.callout h3{font-size:20px;margin-bottom:8px;}
footer{background:var(--ink);color:#9FB0A0;padding:36px 0;font-size:14px;}
footer .wrap{display:flex;flex-wrap:wrap;gap:16px;justify-content:space-between;align-items:center;}
footer a{color:#CBD8C9;text-decoration:none;margin-right:16px;}
@media(max-width:820px){.hero .wrap{grid-template-columns:1fr;}.hero .art{order:-1;}.grid{grid-template-columns:1fr;}.price{grid-template-columns:1fr;}.nav .links a:not(.cta){display:none;}}
</style>
${schema ? `<script type="application/ld+json">${JSON.stringify(schema)}</script>` : ""}
</head>
<body>
<header class="nav"><div class="wrap">
  <a class="brand" href="${HOME}"><img src="/crest.png" alt="${BRAND} crest"/><b>Muddy York <span style="color:var(--gold)">Fishing</span></b></a>
  <nav class="links">
    <a href="/rivers/">Rivers</a><a href="${HOME}#features">Features</a><a href="${HOME}#pricing">Pricing</a>
    <a class="cta" href="${APP_URL}">Start free</a>
  </nav>
</div></header>
${body}
<footer><div class="wrap">
  <div>© ${new Date().getFullYear()} ${BRAND} · Southern Ontario trout &amp; salmon intelligence</div>
  <div><a href="/rivers/">Rivers</a><a href="${HOME}#pricing">Pricing</a><a href="${APP_URL}">Open the app</a></div>
</div></footer>
</body></html>`;
}

// ---- home ----
function homeBody() {
  const feature = (h, p) => `<div class="card"><h3>${h}</h3><p>${p}</p></div>`;
  const riverPreview = RIVERS.slice(0, 8).map((r) => `<a class="river-link" href="/rivers/${slug(r.river + " " + r.section)}/"><b>${esc(r.river)}</b><span>${esc(r.section)}</span></a>`).join("");
  return `
<section class="hero"><div class="wrap">
  <div>
    <h1>Know where the fish are — every morning.</h1>
    <p>${BRAND} reads live conditions on 30+ Southern Ontario trout &amp; salmon rivers, ranks them, and tells you where to go, when it's prime, and what fly to tie on. Spend less time guessing, more time catching.</p>
    <a class="btn primary" href="${APP_URL}">Start your free 14-day trial</a>
    &nbsp; <a class="btn ghost" href="/rivers/">Explore the rivers</a>
  </div>
  <div class="art"><img src="/crest.png" alt="${BRAND}"/></div>
</div></section>

<section class="section" id="features"><div class="wrap">
  <h2>Your unfair advantage on the water</h2>
  <p class="sub">Real-time river intelligence for fly and conventional anglers across Southern Ontario.</p>
  <div class="grid">
    ${feature("Daily opportunity scores", "Every river scored each morning from live water temperature, flow, weather, pressure and the feeding window — so you know before you drive.")}
    ${feature("Fly &amp; technique picks", "The right patterns, sizes and tactics for today's conditions and the fish that are on — beginner-friendly, expert-approved.")}
    ${feature("Depth &amp; likely fish", "What's holding where, how big, and what's been stocked nearby — sharpened by real catches logged in the community.")}
    ${feature("Spot discovery &amp; routes", "Find new water within your radius, with parking and walk-in routes to the river.")}
    ${feature("Log catches &amp; keep notes", "Track your catches and drop private GPS pins. Your exact spots stay private — always.")}
    ${feature("A growing club", "New rivers and spots added all the time. Your map only gets better the longer you're a member.")}
  </div>
</div></section>

<section class="section alt" id="pricing"><div class="wrap">
  <h2>Membership</h2>
  <p class="sub">Start with a 14-day free trial. Cancel anytime.</p>
  <div class="price">
    <div class="plan"><div class="amt">$9.99</div><div class="per">per month</div><p style="color:var(--dim);margin:14px 0;">Full access, billed monthly.</p><a class="btn ghost" href="${APP_URL}">Start free</a></div>
    <div class="plan best"><div class="tag">Best value</div><div class="amt">$59.99</div><div class="per">per year</div><p style="color:var(--dim);margin:14px 0;">Two months free vs. monthly.</p><a class="btn primary" href="${APP_URL}">Start free</a></div>
  </div>
</div></section>

<section class="section"><div class="wrap">
  <h2>Rivers we cover</h2>
  <p class="sub">Trout, steelhead and salmon water across Southern Ontario and the Great Lakes tributaries.</p>
  <div class="rivers-grid">${riverPreview}</div>
  <p style="text-align:center;margin-top:22px;"><a class="btn ghost" href="/rivers/">See all ${RIVERS.length}+ rivers &amp; spots →</a></p>
</div></section>

<section class="section alt"><div class="wrap">
  <h2>Questions</h2>
  <div class="faq">
    <details><summary>What is ${BRAND}?</summary><p>A subscription app that gives Southern Ontario trout and salmon anglers daily, per-river fishing intelligence — live conditions, an opportunity score, fly recommendations, depth and likely fish, and access routes.</p></details>
    <details><summary>Where does it work?</summary><p>Rivers and tributaries across Southern Ontario within about two hours of Toronto — Lake Ontario, Erie, Huron and Georgian Bay systems. Coverage keeps growing.</p></details>
    <details><summary>Is it for beginners?</summary><p>Yes. It tells you where to go, when it's prime, and what to tie on in plain language — while giving experienced anglers a real data edge.</p></details>
    <details><summary>Do you share my fishing spots?</summary><p>Never. Your exact GPS and private notes stay private to you. Community activity is shown only at a reach level.</p></details>
    <details><summary>How much is it?</summary><p>$9.99/month or $59.99/year, with a 14-day free trial. Cancel anytime.</p></details>
  </div>
  <div class="callout" style="margin-top:34px;"><h3>Ready to fish smarter?</h3><a class="btn primary" href="${APP_URL}">Start your free 14-day trial</a></div>
</div></section>`;
}

// ---- river guide page ----
function riverBody(r) {
  const sp = speciesNames(r.species);
  const spList = sp.join(", ").replace(/, ([^,]*)$/, " and $1");
  const url = `${SITE_URL}/rivers/${slug(r.river + " " + r.section)}/`;
  const nearby = (RIVERS.filter((x) => x !== r && x.region === r.region).slice(0, 3).length
    ? RIVERS.filter((x) => x !== r && x.region === r.region)
    : RIVERS.filter((x) => x !== r)).slice(0, 3);
  // Season/tactic rows for each target species on this reach.
  const speciesRows = (r.species || []).map((k) => {
    const info = SP_INFO[k]; if (!info) return "";
    return `<li><b>${esc(SPECIES[k] || k)}</b> — best in ${esc(info.season)}. Approach: ${esc(info.tactic)}.</li>`;
  }).filter(Boolean).join("");
  const cta = (label) => `<div class="callout"><h3>See today's ${esc(r.river)} conditions</h3><p style="color:var(--dim);margin-bottom:14px;">Live opportunity score, the fly &amp; technique for today, depth &amp; likely fish, plus parking and access — free for 14 days.</p><a class="btn primary" href="${APP_URL}">${label}</a></div>`;
  const faqs = [
    { q: `What fish are in the ${r.river} (${r.section})?`, a: `This reach holds ${spList}. ${BRAND} shows which are most active today based on the season and live water conditions.` },
    { q: `When is the best time to fish the ${r.river}?`, a: `It depends on your target and the water. ${(r.species || []).map((k) => SP_INFO[k] ? `${SPECIES[k]} run best in ${SP_INFO[k].season}` : "").filter(Boolean).slice(0, 2).join("; ")}. ${BRAND} scores the exact window each morning.` },
    { q: `How do I check ${r.river} conditions and flows?`, a: `${BRAND} reads live water temperature, flow and weather for the ${r.river} every day, turns it into a 0–100 opportunity score, and tells you the fly, technique and access — no guesswork.` },
  ];
  return {
    body: `
<div class="wrap"><div class="crumbs"><a href="${HOME}">Home</a> › <a href="/rivers/">Rivers</a> › ${esc(r.river)}</div></div>
<section class="section" style="padding-top:14px;"><div class="wrap"><article class="prose">
  <h1>${esc(r.river)} fishing — ${esc(r.section)}</h1>
  <div class="meta">${esc(r.region)} · ${esc(r.zone)} · ${esc(r.water)}</div>
  <div>${sp.map((s) => `<span class="pill">${esc(s)}</span>`).join("")}</div>

  <h2>Overview</h2>
  <p>${esc(r.note)}</p>
  <p>The ${esc(r.river)} (${esc(r.section)}) is ${esc((r.water || "").toLowerCase())} water in ${esc(r.region)}, and anglers here target ${spList}. It sits in ${esc(r.zone)}, so always confirm the current open seasons and limits before you go.</p>

  <h2>Species &amp; seasons</h2>
  <p>Here's when each fish is worth targeting on this reach, and how to approach it:</p>
  <ul>${speciesRows}</ul>

  <h2>How the ${esc(r.river)} fishes</h2>
  <p>${esc(waterHow(r.water))}</p>
  <p>Because conditions swing with rainfall, water temperature and the seasonal runs, the same spot can be red-hot one morning and dead the next. That's exactly what ${BRAND} tracks for you — so you fish the ${esc(r.river)} on the right day, not just any day.</p>

  ${cta(`Open ${BRAND}`)}

  <h2>Access &amp; etiquette</h2>
  <p>${BRAND} maps parking near each reach and the walk-in to the water, and links straight to driving directions. On the ${esc(r.river)}, respect posted private land and access points, pack out everything you bring, give other anglers room, and when the water is warm, land trout fast and release them wet — or rest them for the day.</p>

  <h2>Fish it at the right time</h2>
  <p>Rather than guessing, ${BRAND} scores the ${esc(r.river)} every morning from live water temperature, flow, weather and the feeding window, then recommends the fly and technique for the day — plus the depth to fish and what you're likely to catch.</p>

  <h2>Frequently asked</h2>
  ${faqs.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("")}

  <h2>Nearby water</h2>
  <div class="rivers-grid">${nearby.map((x) => `<a class="river-link" href="/rivers/${slug(x.river + " " + x.section)}/"><b>${esc(x.river)}</b><span>${esc(x.section)}</span></a>`).join("")}</div>
  <p style="margin-top:14px;"><a href="/rivers/">← Browse all ${RIVERS.length}+ Southern Ontario rivers</a></p>

  ${cta("Start your free 14-day trial")}
</article></div></section>`,
    schema: [
      {
        "@context": "https://schema.org", "@type": "Article",
        headline: `${r.river} fishing — ${r.section}`,
        description: `${r.river} (${r.section}) fishing guide: species, seasons, tactics, conditions and access in ${r.region}.`,
        about: sp, mainEntityOfPage: url, publisher: { "@type": "Organization", name: BRAND, url: SITE_URL },
      },
      {
        "@context": "https://schema.org", "@type": "FAQPage",
        mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
      },
    ],
  };
}

// ---- write everything ----
// NOTE: the app owns the root index.html; the marketing landing lives at /fishing/
// so it never overwrites the app. All other pages are new paths in the deploy.
fs.mkdirSync(path.join(OUT, "rivers"), { recursive: true });
fs.mkdirSync(path.join(OUT, "fishing"), { recursive: true });
fs.copyFileSync(path.join(ROOT, "icons", "crest.png"), path.join(OUT, "crest.png"));

fs.writeFileSync(path.join(OUT, "fishing", "index.html"), page({
  title: `${BRAND} — Ontario Trout & Salmon Fishing App`,
  description: "Daily river intelligence for Southern Ontario anglers: live conditions, opportunity scores, fly picks and access for 30+ trout & salmon rivers. Start free.",
  canonical: SITE_URL + "/fishing/", body: homeBody(),
  schema: { "@context": "https://schema.org", "@type": "SoftwareApplication", name: BRAND, applicationCategory: "LifestyleApplication",
    operatingSystem: "Web, iOS", offers: { "@type": "Offer", price: "9.99", priceCurrency: "CAD" }, url: SITE_URL },
}));

const urls = [SITE_URL + "/", SITE_URL + "/fishing/", SITE_URL + "/rivers/"];
for (const r of RIVERS) {
  const s = slug(r.river + " " + r.section);
  const dir = path.join(OUT, "rivers", s);
  fs.mkdirSync(dir, { recursive: true });
  const { body, schema } = riverBody(r);
  fs.writeFileSync(path.join(dir, "index.html"), page({
    title: `${r.river} Fishing (${r.section}) — Conditions & Species | ${BRAND}`,
    description: `${r.river} fishing guide: ${speciesNames(r.species).join(", ")} in ${r.region}. Live conditions, best times and access with ${BRAND}.`,
    canonical: `${SITE_URL}/rivers/${s}/`, body, schema,
  }));
  urls.push(`${SITE_URL}/rivers/${s}/`);
}

// rivers index (grouped by region)
const byRegion = {};
for (const r of RIVERS) (byRegion[r.region] ||= []).push(r);
const riversIndexBody = `
<section class="section"><div class="wrap">
  <h2 style="text-align:left;">Rivers &amp; spots we cover</h2>
  <p style="color:var(--dim);max-width:700px;margin-top:8px;">${RIVERS.length}+ trout, steelhead and salmon rivers across Southern Ontario. Tap any river for its guide, then open the app for today's live conditions.</p>
  ${Object.keys(byRegion).sort().map((reg) => `<h3 style="margin:28px 0 6px;font-size:18px;">${esc(reg)}</h3><div class="rivers-grid">${byRegion[reg].map((r) => `<a class="river-link" href="/rivers/${slug(r.river + " " + r.section)}/"><b>${esc(r.river)}</b><span>${esc(r.section)}</span></a>`).join("")}</div>`).join("")}
  <div class="callout" style="margin-top:36px;"><h3>Get today's conditions on all of them</h3><a class="btn primary" href="${APP_URL}">Start free</a></div>
</div></section>`;
fs.writeFileSync(path.join(OUT, "rivers", "index.html"), page({
  title: `Ontario Trout & Salmon Rivers — ${RIVERS.length}+ Fishing Guides | ${BRAND}`,
  description: `Guides to ${RIVERS.length}+ Southern Ontario trout, steelhead and salmon rivers — species, seasons and access. Live conditions in the ${BRAND} app.`,
  canonical: SITE_URL + "/rivers/", body: riversIndexBody,
}));

// sitemap + robots
fs.writeFileSync(path.join(OUT, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls.map((u) => `  <url><loc>${u}</loc></url>`).join("\n") + `\n</urlset>\n`);
// publish="." serves the whole repo, so keep crawlers out of source/dev paths.
fs.writeFileSync(path.join(OUT, "robots.txt"),
  `User-agent: *\nAllow: /\n` +
  ["/marketing/", "/backend/", "/lib/", "/server/", "/docs/", "/.github/", "/source-app.jsx", "/build.mjs", "/package.json"]
    .map((p) => `Disallow: ${p}`).join("\n") +
  `\nSitemap: ${SITE_URL}/sitemap.xml\n`);

console.log(`Built ${RIVERS.length} river pages + /fishing landing + /rivers index + sitemap (${urls.length} URLs) into repo root.`);
