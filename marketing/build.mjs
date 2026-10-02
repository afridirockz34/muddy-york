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

import { SITE_URL, APP_URL, HOME, BRAND, esc, page } from "../lib/site-shell.js";

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
  <p style="margin-top:14px;"><a href="/rivers/">← Browse all ${RIVERS.length}+ Southern Ontario rivers</a>${(() => { const reg = REGIONS.find((x) => x.filter(r)); return reg ? ` · <a href="/regions/${reg.slug}/">${esc(reg.h1)} →</a>` : ""; })()}</p>

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

// ---- pillar / guide pages (target broad Ontario fishing searches) ----
const riverGrid = (list) => `<div class="rivers-grid">${list.slice(0, 12).map((r) => `<a class="river-link" href="/rivers/${slug(r.river + " " + r.section)}/"><b>${esc(r.river)}</b><span>${esc(r.section)}</span></a>`).join("")}</div>`;

const GUIDES = [
  {
    slug: "steelhead-fishing-ontario",
    title: `Steelhead Fishing in Ontario — Rivers, Runs & Tactics`,
    desc: "Where and when to fish steelhead (lake-run rainbow trout) in Southern Ontario: the best Great Lakes tributaries, run timing, flies and tactics.",
    h1: "Steelhead fishing in Ontario",
    filter: (r) => r.species.includes("STL") || r.species.includes("RBT"),
    intro: [
      "Steelhead — lake-run rainbow trout — are the prize of Southern Ontario's Great Lakes tributaries. Each spring and fall they push out of Lakes Ontario, Erie and Huron into the rivers, drawing fly and float anglers to famous water like the Ganaraska, Saugeen, Credit and Niagara.",
      "The catch is timing. Steelhead move on fresh water: a rain that bumps and colours a river, then drops and clears, is the classic window. Fish the wrong day and a river is dead; fish the drop and it can be the day of the season.",
    ],
    sections: [
      { h: "When steelhead run in Ontario", p: "Fall run fish start entering the tributaries from late September through December, with holdover fish through winter where seasons stay open. The spring run — the biggest push — comes March through May as fish stage to spawn. Many lower tributary reaches carry extended seasons into December; upper reaches and sanctuaries close, so always confirm the current regulations for the exact water." },
      { h: "How to catch them", p: "Drift eggs, nymphs and stoneflies through runs and tailouts under a float or on a tight line, and swing streamers when the water is stained. Fish hold in the deeper slots and the seams beside faster water. On low, clear water, downsize and lengthen your leader; on high, stained water, go bigger and brighter." },
      { h: "Best steelhead rivers", links: true },
    ],
    faqs: [
      { q: "When is the best time for steelhead in Ontario?", a: "The spring run (March–May) is the largest, and the fall run (late September–December) is prime on fresh, dropping water. Muddy York Fishing scores each river daily so you fish the right window." },
      { q: "What's the difference between steelhead and rainbow trout?", a: "They're the same species — steelhead are the lake-run form that spend part of their life in the Great Lakes and run the tributaries to spawn, growing much larger than resident stream rainbows." },
    ],
  },
  {
    slug: "salmon-run-ontario",
    title: `Salmon Run in Ontario — Chinook & Coho Rivers and Timing`,
    desc: "The Ontario fall salmon run: when Chinook and Coho salmon run the Great Lakes tributaries, the best rivers to fish, and how to target them.",
    h1: "The Ontario salmon run",
    filter: (r) => r.species.includes("CHN") || r.species.includes("COH"),
    intro: [
      "Every fall, Chinook (king) and Coho salmon leave the Great Lakes and surge up Southern Ontario's tributaries to spawn — one of the most dramatic fisheries in the province. Rivers like the Credit, Humber, Ganaraska, Saugeen and Niagara fill with big, aggressive fish.",
      "The run is short and weather-driven. A cool, rainy stretch in September and October pulls fresh fish in on every push; a warm, dry spell can stall it. Reading the water and the rain is everything.",
    ],
    sections: [
      { h: "When is the Ontario salmon run?", p: "Chinook typically run from late August through October, peaking in September; Coho follow slightly later into October and November. Fresh rain that bumps the rivers triggers each new push, and first light is prime in the lower-river pools." },
      { h: "How to fish the run", p: "Target deep holding pools, log-jam tailouts and current breaks in the lower river. Swing large, bright streamers and spey flies slowly through the lies, or drift roe and heavy nymphs. These are powerful fish on a fresh push — heavier tackle and stout leaders earn their keep." },
      { h: "Best salmon rivers", links: true },
    ],
    faqs: [
      { q: "When do salmon run in Ontario?", a: "Chinook salmon run from late August into October (peak September); Coho a little later into November. Runs surge on fresh rain — Muddy York Fishing tracks the rivers daily so you catch the push." },
      { q: "Where can I see the salmon run near Toronto?", a: "The Credit, Humber and Rouge rivers all get strong fall runs within reach of Toronto. Open the river guides for access and today's conditions." },
    ],
  },
  {
    slug: "fly-fishing-near-toronto",
    title: `Fly Fishing Near Toronto — Rivers, Trout & Salmon`,
    desc: "The best rivers to fly fish near Toronto for trout, steelhead and salmon — from the Credit and Humber to the Rouge — with live conditions and access.",
    h1: "Fly fishing near Toronto",
    filter: (r) => /credit|humber|rouge|bronte|sixteen|don|duffins/i.test(r.river),
    intro: [
      "You don't have to drive north for good water. Within an hour of Toronto, the Credit, Humber, Rouge, Bronte and Sixteen Mile hold resident brown and brook trout through the season and fill with steelhead and salmon on the spring and fall runs.",
      "These urban and near-urban rivers change fast with rainfall and rise and fall with the seasonal runs, so knowing which one is fishing today saves a wasted trip.",
    ],
    sections: [
      { h: "The best rivers near Toronto", links: true },
      { h: "What you'll catch", p: "Resident brown and brook trout in the cooler upper and middle reaches through spring to fall; lake-run steelhead and Chinook/Coho salmon in the lower reaches on the migratory runs. The Credit is the classic all-rounder, the Humber and Rouge get strong fall runs, and Bronte and Sixteen Mile are productive lower-river tributaries." },
      { h: "Fish the right day", p: "Muddy York Fishing reads live water temperature, flow and weather on each of these rivers every morning, ranks them, and tells you where to go, when it's prime, and what fly to tie on — plus parking and the walk to the water." },
    ],
    faqs: [
      { q: "Where can I fly fish near Toronto?", a: "The Credit, Humber, Rouge, Bronte Creek and Sixteen Mile Creek are all within about an hour of the city and hold trout, steelhead and salmon depending on the season." },
      { q: "Do I need a licence to fish in Ontario?", a: "Yes — an Ontario Outdoors Card with a fishing licence is required for most anglers. Always check the current Ontario fishing regulations for the water you plan to fish." },
    ],
  },
  {
    slug: "brown-trout-fishing-ontario",
    title: `Brown Trout Fishing in Ontario — Rivers & Seasons`,
    desc: "Brown trout fishing in Southern Ontario: resident stream browns and lake-run browns, the best rivers and tailwaters, seasons and tactics.",
    h1: "Brown trout fishing in Ontario",
    filter: (r) => r.species.includes("BNT") || r.species.includes("BNTr"),
    intro: [
      "Brown trout are Southern Ontario's wariest, most rewarding stream fish. Wild resident browns hold in cold headwaters and tailwaters like the Grand below Shand Dam and the upper Credit, while lake-run browns run the Great Lakes tributaries in spring and fall.",
      "Browns reward a careful approach: light tippet, a quiet wade, and reading the water at first and last light when the biggest fish feed.",
    ],
    sections: [
      { h: "Resident vs. lake-run browns", p: "Resident stream browns live in the river year-round and fish through the general season (roughly the fourth Saturday of April to September 30). Lake-run browns — bigger, silver fish from the lakes — run the lower tributaries in spring and fall, often alongside steelhead. Cold tailwaters like the Grand can fish for browns almost year-round where regulations allow." },
      { h: "How to catch brown trout", p: "Match the hatch with dries and a dry-dropper in prime temps, nymph the seams in cooler water, and swing or strip streamers at first and last light for the larger fish. Downsize and lengthen leaders on low, clear water." },
      { h: "Best brown trout rivers", links: true },
    ],
    faqs: [
      { q: "Where is the best brown trout fishing in Ontario?", a: "The Grand River tailwater below Shand Dam is Ontario's premier resident brown-trout water; the upper Credit, Conestogo tailwater and many cold tributaries also hold wild browns, and the lower Great Lakes tributaries get lake-run browns." },
      { q: "When is brown trout season in Ontario?", a: "Resident stream trout generally open from the fourth Saturday of April to September 30, with extended fall seasons on named migratory rivers. Confirm the exact reach in the current Ontario regulations — Muddy York Fishing shows the season status for each river." },
    ],
  },
  {
    slug: "float-fishing-for-steelhead",
    title: `Float Fishing for Steelhead — Setup, Gear & Technique`,
    desc: "How to float fish for steelhead in Ontario's rivers: centerpin and float rods, the float rig and shot pattern, baits and beads, and reading the water.",
    h1: "Float fishing for steelhead",
    filter: (r) => r.species.includes("STL") || r.species.includes("RBT"),
    intro: [
      "Float fishing is the deadliest way to present a bait to steelhead in a river, and it's why you see so many centerpin and float rods on the Ganaraska, Saugeen and Credit each run. A float lets you drift a bait at the exact speed of the current, drag-free, right along the bottom where steelhead hold — the presentation they can't resist.",
      "It looks technical, but the core idea is simple: get your bait down, drift it naturally through the holding water, and watch the float for the take.",
    ],
    sections: [
      { h: "The gear", p: "Two setups dominate. A centerpin reel on a 12–13' float rod gives the longest, most natural drag-free drifts and is the gold standard for dedicated steelheaders. A float (spinning) setup on a similar long rod is easier to learn and covers most water. Either way, the long rod is what mends line and controls the drift." },
      { h: "The float rig", p: "Run the mainline to a float sized to the water (bigger and buoyant for heavy flow, small for slow, clear water), then a shot pattern below it — heavier shot up top tapering to smaller shot near the hook so the bait leads naturally. Below the shot, tie a lighter fluorocarbon leader (roughly 6–10 lb, lighter on clear water) to your hook. Set the float depth so the bait ticks bottom: as a rule of thumb, start at about 1.5× the water's depth and adjust until you occasionally touch." },
      { h: "Baits, beads and flies", p: "Roe bags are the classic steelhead bait; plastic beads (pegged above the hook) and soft plastics have become just as popular and are cleaner to fish. Nymphs, egg patterns and small jigs all drift well under a float too. Match colour to clarity — natural and subtle in clear water, brighter (orange, chartreuse, pink) in stain." },
      { h: "Reading the water & the drift", p: "Steelhead hold in the deeper slots, the tailouts of pools, and the seams beside faster water. Cast up and across, let the float settle, then keep the line off the water and mend so the float drifts at the current's speed — never dragging. When the float dips, hesitates or shoots under, set. Work a run in lanes, covering the near seam before the far one." },
      { h: "Best rivers to float fish", links: true },
    ],
    faqs: [
      { q: "What float rig do I use for steelhead?", a: "A buoyant float sized to the flow, a tapering shot pattern below it (heavier up, lighter near the hook), and a light fluorocarbon leader to the hook. Set the depth so the bait ticks bottom — about 1.5× the water depth to start." },
      { q: "Do I need a centerpin reel to float fish?", a: "No. A centerpin gives the longest drag-free drifts and is ideal, but a float setup on a long spinning rod catches plenty of steelhead and is easier to learn." },
      { q: "What's the best bait for steelhead?", a: "Roe bags, pegged beads and soft plastics are all top steelhead baits, along with egg patterns, nymphs and small jigs under a float. Match colour to water clarity — natural in clear water, brighter in stain." },
    ],
  },
  {
    slug: "ontario-trout-opener",
    title: `Ontario Trout Opener — Season Dates & Where to Fish`,
    desc: "When trout season opens in Ontario (the fourth Saturday in April), what the opener means by zone, and the best rivers to fish on opening day.",
    h1: "The Ontario trout opener",
    filter: (r) => r.species.includes("BKT") || r.species.includes("BNT"),
    intro: [
      "For Southern Ontario anglers, the trout opener is the real start of the season. Across most of the province, the general stream-trout season opens on the fourth Saturday in April — the first legal day to target brook and brown trout in most rivers and streams.",
      "It's more than a date. Opening weekend puts hungry, un-pressured fish in cold, high spring water, and it's a tradition that draws anglers back to the same runs year after year.",
    ],
    sections: [
      { h: "When does trout season open in Ontario?", p: "In the Southern divisions the general stream-trout (brook and brown trout) season runs from the fourth Saturday in April through September 30. Dates and exceptions vary by Fisheries Management Zone (FMZ), and many Great Lakes tributaries carry extended migratory seasons or spring sanctuary closures that override the zone default — so always confirm the exact reach before you go. Muddy York Fishing shows the current season status (open, closed, or check regs) for each river." },
      { h: "Where to fish on opening day", p: "Cold, spring-fed headwaters and tailwaters fish best early, while the water is still cold and often high. Tailwaters like the Grand below Shand Dam and the Conestogo run clearer and steadier than freestones after spring rain. Focus on the deeper slots and seams, and fish through the warmest part of the day." },
      { h: "Best rivers for the opener", links: true },
    ],
    faqs: [
      { q: "When is the trout opener in Ontario?", a: "In most of Southern Ontario the general stream-trout season opens on the fourth Saturday in April and runs to September 30. Some zones and waters differ, so confirm the current Ontario regulations for the exact river." },
      { q: "Do I need a licence for the trout opener?", a: "Yes — a valid Ontario fishing licence (with an Outdoors Card) is required. Check the current regulations for season dates, limits and any sanctuary closures on the water you plan to fish." },
      { q: "What's the best bait or fly for opening day?", a: "Cold, high spring water favours getting down: weighted nymphs and small streamers fished deep and slow, plus egg patterns where migratory fish are still around. Muddy York Fishing recommends the technique and flies for each river based on the day's conditions." },
    ],
  },
];

const guideCta = (label) => `<div class="callout"><h3>Fish Southern Ontario on the right day</h3><p style="color:var(--dim);margin-bottom:14px;">Live conditions, the fly &amp; technique for today, depth &amp; likely fish, and access for 30+ rivers — free for 14 days.</p><a class="btn primary" href="${APP_URL}">${label}</a></div>`;

function guideBody(g) {
  const rivers = RIVERS.filter(g.filter);
  const url = `${SITE_URL}/guides/${g.slug}/`;
  const secHtml = g.sections.map((s) => s.links
    ? `<h2>${esc(s.h)}</h2><p>These Southern Ontario rivers are among the best — open any for its full guide and today's live conditions:</p>${riverGrid(rivers)}`
    : `<h2>${esc(s.h)}</h2><p>${esc(s.p)}</p>`).join("\n");
  return {
    body: `
<div class="wrap"><div class="crumbs"><a href="${HOME}">Home</a> › <a href="/guides/">Guides</a> › ${esc(g.h1)}</div></div>
<section class="section" style="padding-top:14px;"><div class="wrap"><article class="prose">
  <h1>${esc(g.h1)}</h1>
  ${g.intro.map((p) => `<p>${esc(p)}</p>`).join("\n")}
  ${guideCta(`Open ${BRAND}`)}
  ${secHtml}
  <h2>Frequently asked</h2>
  ${g.faqs.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("")}
  <p style="margin-top:18px;"><a href="/rivers/">Browse all ${RIVERS.length}+ Southern Ontario rivers →</a></p>
  ${guideCta("Start your free 14-day trial")}
</article></div></section>`,
    schema: [
      { "@context": "https://schema.org", "@type": "Article", headline: g.h1, description: g.desc, mainEntityOfPage: url, publisher: { "@type": "Organization", name: BRAND, url: SITE_URL } },
      { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: g.faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
    ],
  };
}

// ---- region pages (target "<place> fishing" searches) ----
const REGIONS = [
  {
    slug: "lake-ontario-tributaries",
    title: `Lake Ontario Tributary Fishing — Steelhead, Salmon & Trout`,
    desc: "The best Lake Ontario tributaries for steelhead, salmon and trout — the Credit, Humber, Rouge, Ganaraska, Bowmanville and more — with seasons and access.",
    h1: "Lake Ontario tributary fishing",
    filter: (r) => /Lake Ontario/i.test(r.region),
    intro: [
      "Lake Ontario's tributaries are Southern Ontario's steelhead-and-salmon highway. From the Credit and Humber on the west end to the Ganaraska, Bowmanville and Wilmot to the east, these rivers fill with migratory fish each spring and fall — and many are within an hour of Toronto.",
      "They're rain-driven: each fresh push pulls new fish up from the lake, then the drop and clear is prime. Knowing which tributary is fishing today is the difference between a banner day and a wasted drive.",
    ],
  },
  {
    slug: "georgian-bay-lake-huron",
    title: `Georgian Bay & Lake Huron Tributary Fishing — Steelhead & Salmon`,
    desc: "Fishing the Georgian Bay and Lake Huron tributaries — the Nottawasaga, Saugeen, Maitland, Beaver, Bighead and Sauble — for steelhead, salmon and trout.",
    h1: "Georgian Bay & Lake Huron tributary fishing",
    filter: (r) => /Georgian Bay|Lake Huron/i.test(r.region),
    intro: [
      "The rivers flowing into Georgian Bay and Lake Huron hold some of Ontario's most storied steelhead and salmon water. The Saugeen and Maitland draw anglers from across the province, while the Nottawasaga, Beaver, Bighead and Sauble each run their own spring and fall migrations.",
      "This is bigger, wilder water than the urban tributaries, and it rewards anglers who time the runs and read fresh, dropping flows.",
    ],
  },
  {
    slug: "grand-river",
    title: `Grand River Fishing — Brown Trout, Steelhead & Salmon`,
    desc: "Fishing the Grand River watershed: the world-class brown-trout tailwater below Shand Dam, the lower river to Lake Erie, and the Conestogo tailwater.",
    h1: "Grand River fishing",
    filter: (r) => /grand|conestogo/i.test(r.river),
    intro: [
      "The Grand is Ontario's signature trout river. The tailwater below Shand Dam runs cold and steady, holding wild brown trout that make it one of the best resident-trout fisheries in the country, while the lower river down to Lake Erie draws a strong run of migratory rainbow and brown trout.",
      "Because the tailwater is dam-controlled, it fishes when freestones are blown out or too warm — a reliable option across the season.",
    ],
  },
  {
    slug: "toronto-area-rivers",
    title: `Toronto-Area River Fishing — Trout, Steelhead & Salmon`,
    desc: "Fishing the rivers in and around Toronto — the Credit, Humber, Rouge, Bronte, Sixteen Mile and Duffins — for trout, steelhead and salmon, with access and live conditions.",
    h1: "Toronto-area river fishing",
    filter: (r) => /credit|humber|rouge|bronte|sixteen|duffins|\bdon\b/i.test(r.river),
    intro: [
      "You don't have to leave the GTA for real fishing. The Credit, Humber and Rouge run right through the western and eastern suburbs, while Bronte Creek, Sixteen Mile Creek and Duffins Creek sit a short drive out — all holding resident trout through the season and filling with steelhead and salmon on the spring and fall runs.",
      "These rivers change quickly with city rain, so the same creek can be prime one morning and blown out the next. Knowing which one is fishing today turns a lunch-break session into a real shot at fish.",
    ],
  },
  {
    slug: "niagara-region",
    title: `Niagara Region Fishing — Lower Niagara & Twelve Mile Creek`,
    desc: "Fishing the Niagara region: the powerful lower Niagara River for steelhead, brown trout and lake trout, plus cold-water Twelve Mile Creek near St. Catharines.",
    h1: "Niagara region fishing",
    filter: (r) => /Niagara/i.test(r.region),
    intro: [
      "The Niagara region packs big-water drama into a small area. The lower Niagara River — below the falls, through the whirlpool and Devil's Hole — is a world-class drift fishery for steelhead, brown trout and lake trout, while Twelve Mile Creek near St. Catharines offers a cold, wild-trout contrast.",
      "The lower Niagara is a special border water with its own regulations, so always confirm the current rules before you fish.",
    ],
  },
];

function regionBody(g) {
  const rivers = RIVERS.filter(g.filter);
  const url = `${SITE_URL}/regions/${g.slug}/`;
  const species = [...new Set(rivers.flatMap((r) => speciesNames(r.species)))];
  return {
    body: `
<div class="wrap"><div class="crumbs"><a href="${HOME}">Home</a> › <a href="/rivers/">Rivers</a> › ${esc(g.h1)}</div></div>
<section class="section" style="padding-top:14px;"><div class="wrap"><article class="prose">
  <h1>${esc(g.h1)}</h1>
  ${g.intro.map((p) => `<p>${esc(p)}</p>`).join("\n")}
  ${species.length ? `<p><b>What you'll catch:</b> ${esc(species.join(", ").replace(/, ([^,]*)$/, " and $1"))}.</p>` : ""}
  ${guideCta(`Open ${BRAND}`)}
  <h2>Rivers in this region</h2>
  <p>Open any river for its full guide, species &amp; seasons, and today's live conditions:</p>
  ${riverGrid(rivers)}
  <h2>Fish the right river on the right day</h2>
  <p>${BRAND} reads live water temperature, flow and weather on every one of these rivers each morning, ranks them by opportunity, and tells you where to go, when it's prime and what fly to tie on — plus parking and the walk to the water, and the current Ontario season status for each reach.</p>
  <h2>Frequently asked</h2>
  <details><summary>What can I catch in this region?</summary><p>These waters hold ${esc(species.join(", "))}. ${BRAND} shows which are most active today based on the season and live conditions.</p></details>
  <details><summary>Do I need a fishing licence in Ontario?</summary><p>Yes — a valid Ontario fishing licence with an Outdoors Card is required for most anglers. Always confirm the current regulations, seasons and any sanctuary closures for the exact water.</p></details>
  <p style="margin-top:18px;"><a href="/rivers/">Browse all ${RIVERS.length}+ Southern Ontario rivers →</a> · <a href="/guides/">Ontario fishing guides →</a></p>
  ${guideCta("Start your free 14-day trial")}
</article></div></section>`,
    schema: [
      { "@context": "https://schema.org", "@type": "Article", headline: g.h1, description: g.desc, mainEntityOfPage: url, publisher: { "@type": "Organization", name: BRAND, url: SITE_URL } },
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
  <h3 style="margin:30px 0 6px;font-size:18px;">Fishing regions</h3>
  <div class="rivers-grid">${REGIONS.map((g) => `<a class="river-link" href="/regions/${g.slug}/"><b>${esc(g.h1)}</b><span>${esc(g.desc).slice(0, 60)}…</span></a>`).join("")}</div>
  <h3 style="margin:30px 0 6px;font-size:18px;">Ontario fishing guides</h3>
  <div class="rivers-grid">${GUIDES.map((g) => `<a class="river-link" href="/guides/${g.slug}/"><b>${esc(g.h1)}</b><span>${esc(g.desc).slice(0, 64)}…</span></a>`).join("")}</div>
  <div class="callout" style="margin-top:36px;"><h3>Get today's conditions on all of them</h3><a class="btn primary" href="${APP_URL}">Start free</a></div>
</div></section>`;
fs.writeFileSync(path.join(OUT, "rivers", "index.html"), page({
  title: `Ontario Trout & Salmon Rivers — ${RIVERS.length}+ Fishing Guides | ${BRAND}`,
  description: `Guides to ${RIVERS.length}+ Southern Ontario trout, steelhead and salmon rivers — species, seasons and access. Live conditions in the ${BRAND} app.`,
  canonical: SITE_URL + "/rivers/", body: riversIndexBody,
}));

// guide / pillar pages + guides index
fs.mkdirSync(path.join(OUT, "guides"), { recursive: true });
for (const g of GUIDES) {
  const dir = path.join(OUT, "guides", g.slug);
  fs.mkdirSync(dir, { recursive: true });
  const { body, schema } = guideBody(g);
  fs.writeFileSync(path.join(dir, "index.html"), page({ title: `${g.title} | ${BRAND}`, description: g.desc, canonical: `${SITE_URL}/guides/${g.slug}/`, body, schema }));
  urls.push(`${SITE_URL}/guides/${g.slug}/`);
}
const guidesIndexBody = `
<section class="section"><div class="wrap">
  <h2 style="text-align:left;">Ontario fishing guides</h2>
  <p style="color:var(--dim);max-width:700px;margin-top:8px;">Where and when to fish for steelhead, salmon and trout across Southern Ontario — then open the app for today's live conditions.</p>
  <div class="rivers-grid" style="margin-top:16px;">${GUIDES.map((g) => `<a class="river-link" href="/guides/${g.slug}/"><b>${esc(g.h1)}</b><span>${esc(g.desc).slice(0, 70)}…</span></a>`).join("")}</div>
  <p style="margin-top:20px;"><a href="/rivers/">Browse all ${RIVERS.length}+ rivers →</a></p>
</div></section>`;
fs.writeFileSync(path.join(OUT, "guides", "index.html"), page({
  title: `Ontario Fishing Guides — Steelhead, Salmon & Trout | ${BRAND}`,
  description: "Guides to steelhead, salmon and trout fishing across Southern Ontario — run timing, tactics and the best rivers, with live conditions in the app.",
  canonical: SITE_URL + "/guides/", body: guidesIndexBody,
}));
urls.push(SITE_URL + "/guides/");

// region pages + regions index
fs.mkdirSync(path.join(OUT, "regions"), { recursive: true });
for (const g of REGIONS) {
  const dir = path.join(OUT, "regions", g.slug);
  fs.mkdirSync(dir, { recursive: true });
  const { body, schema } = regionBody(g);
  fs.writeFileSync(path.join(dir, "index.html"), page({ title: `${g.title} | ${BRAND}`, description: g.desc, canonical: `${SITE_URL}/regions/${g.slug}/`, body, schema }));
  urls.push(`${SITE_URL}/regions/${g.slug}/`);
}
const regionsIndexBody = `
<section class="section"><div class="wrap">
  <h2 style="text-align:left;">Fishing regions of Southern Ontario</h2>
  <p style="color:var(--dim);max-width:700px;margin-top:8px;">Explore the rivers by region — Lake Ontario and Lake Huron tributaries, the Grand River watershed and Niagara — then open the app for today's live conditions.</p>
  <div class="rivers-grid" style="margin-top:16px;">${REGIONS.map((g) => `<a class="river-link" href="/regions/${g.slug}/"><b>${esc(g.h1)}</b><span>${esc(g.desc).slice(0, 66)}…</span></a>`).join("")}</div>
  <p style="margin-top:20px;"><a href="/rivers/">Browse all ${RIVERS.length}+ rivers →</a></p>
</div></section>`;
fs.writeFileSync(path.join(OUT, "regions", "index.html"), page({
  title: `Southern Ontario Fishing Regions — Rivers by Area | ${BRAND}`,
  description: "Fishing regions of Southern Ontario: Lake Ontario tributaries, Georgian Bay & Lake Huron, the Grand River and Niagara — with live conditions in the app.",
  canonical: SITE_URL + "/regions/", body: regionsIndexBody,
}));
urls.push(SITE_URL + "/regions/");

// sitemap + robots
fs.writeFileSync(path.join(OUT, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls.map((u) => `  <url><loc>${u}</loc></url>`).join("\n") + `\n</urlset>\n`);
// publish="." serves the whole repo, so keep crawlers out of source/dev paths.
fs.writeFileSync(path.join(OUT, "robots.txt"),
  `User-agent: *\nAllow: /\n` +
  ["/marketing/", "/backend/", "/lib/", "/server/", "/docs/", "/.github/", "/source-app.jsx", "/build.mjs", "/package.json"]
    .map((p) => `Disallow: ${p}`).join("\n") +
  `\nSitemap: ${SITE_URL}/sitemap.xml\nSitemap: ${SITE_URL}/blog-sitemap.xml\n`);

console.log(`Built ${RIVERS.length} river pages + ${GUIDES.length} guides + ${REGIONS.length} region pages + /fishing landing + indexes + sitemap (${urls.length} URLs) into repo root.`);
