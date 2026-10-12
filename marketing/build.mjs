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

import { SITE_URL, APP_URL, SIGNIN_URL, HOME, BRAND, esc, page } from "../lib/site-shell.js";
import { withBrand } from "./seo-content.mjs";
import { riverPage, salmonHub, salmonSpotPage, townPage, steelheadRivers, steelheadPage, steelheadHub, LIVE_STATUS_SCRIPT, RUN_STATUS_SCRIPT, TOWNS, SALMON_SPOTS } from "./seo-pages.mjs";
import { PHOTOS, creditRows, riverPhoto } from "./photos.mjs";

// ---- pull the RIVERS array out of the app source (plain data, safe to eval) ----
const src = fs.readFileSync(path.join(ROOT, "source-app.jsx"), "utf8");
const arrStart = src.indexOf("const RIVERS = [") + "const RIVERS = ".length;
const arrEnd = src.indexOf("\n];", arrStart) + 2; // include the closing ]
const RIVERS = eval("(" + src.slice(arrStart, arrEnd) + ")").map((r) => ({ ...r, section: r.section.replace(/\s*[—–]\s*/g, ": "), note: (r.note || "").replace(/\s*[—–]\s*/g, ", ") }));

const SPECIES = { STL: "Steelhead", CHN: "Chinook salmon", COH: "Coho salmon",
  BNTr: "Brown trout (lake-run)", BNT: "Brown trout", RBT: "Rainbow trout", BKT: "Brook trout",
  ATS: "Atlantic salmon", LAT: "Lake trout", SMB: "Smallmouth bass", NP: "Northern pike",
  WAL: "Walleye", PAN: "Panfish" };
// Per-species season + go-to tactic, used to write richer river guides.
const SP_INFO = {
  STL: { season: "spring (Mar to May) and fall through winter (Oct to Feb) on the runs", tactic: "drift eggs, stoneflies and nymphs through runs and tailouts, or swing streamers when the water is stained" },
  CHN: { season: "the fall run (Sept to Oct)", tactic: "swing large bright streamers and spey flies slowly through deep holding pools in the lower river" },
  COH: { season: "fall (Oct to Nov)", tactic: "work bright streamers and egg patterns through lower-river pools and current breaks" },
  BNTr: { season: "spring and fall for lake-run fish", tactic: "fish streamers, eggs and nymphs on dropping, clearing water" },
  BNT: { season: "April to June and September to October (early and late only in summer heat)", tactic: "cover water with a dry-dropper and nymphs in prime temps, and swing streamers at first and last light" },
  RBT: { season: "spring through fall", tactic: "nymph the seams and run a dry-dropper over the riffles" },
  BKT: { season: "late spring and fall in cold headwaters", tactic: "fish small dries, nymphs and tiny streamers on light tippet" },
  ATS: { season: "summer into fall", tactic: "present small wets and nymphs on light tippet in low light, strictly catch-and-release, barbless" },
  LAT: { season: "the cold months near river mouths and deep water", tactic: "work deep, slow streamers and jigs off the main current" },
  SMB: { season: "summer (June to September)", tactic: "throw crayfish and baitfish streamers, and poppers on warm evenings" },
  NP: { season: "spring and fall", tactic: "strip big flashy streamers on a wire or heavy fluorocarbon bite guard" },
  WAL: { season: "spring and fall in low light", tactic: "fish jigs and streamers deep and slow near current breaks" },
  PAN: { season: "spring through summer", tactic: "use small nymphs, wets and poppers on light gear" },
};
// A short read on how a reach fishes, inferred from its water description.
function waterHow(water) {
  const w = (water || "").toLowerCase();
  if (w.includes("tailwater")) return "As a tailwater below a dam, flows and temperatures stay steadier than a freestone, it fishes well when nearby rivers are blown out or too warm, and cold releases can hold trout through summer.";
  if (w.includes("spring") || w.includes("headwater") || w.includes("cold")) return "These cold, spring-fed headwaters run clear and cool. Fish move to the shade and oxygen, approach quietly, downsize your tippet, and read the pocket water.";
  if (w.includes("tributar")) return "A smaller tributary like this warms and clears faster than the main stem, so it fishes first after rain and concentrates migratory fish on a fresh push.";
  if (w.includes("lower") || w.includes("mouth")) return "Down in the lower river near the lake, deep pools, log-jams and current breaks hold migratory fish on a fresh push after rain, first and last light are prime.";
  return "This freestone reach rises and clears with rainfall, so timing is everything: it fishes best on dropping, clearing water a day or two after a rise.";
}
const speciesNames = (keys) => [...new Set((keys || []).map((k) => (SPECIES[k] || k).replace(/\s*\(.*\)$/, "")))];
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// ---- home ----
// ── Landing page ──
// One bold moment: a full-bleed river photo with a club card that shows this
// morning's official season status on three well-known rivers, live. The rest
// stays quiet: real fish, real app screens, plain prices.
const HOME_CSS = `<style>
.mh{position:relative;color:#EFE9DB;background:var(--ink) url('${PHOTOS.elora.src}') center 55%/cover;}
.mh::before{content:"";position:absolute;inset:0;background:linear-gradient(100deg,rgba(22,36,27,.92) 0%,rgba(22,36,27,.72) 48%,rgba(22,36,27,.25) 100%);}
.mh .wrap{position:relative;display:grid;grid-template-columns:1.15fr .85fr;gap:44px;align-items:center;padding-top:72px;padding-bottom:84px;}
.mh h1{color:#fff;font-size:clamp(36px,5.2vw,58px);font-weight:800;line-height:1.05;letter-spacing:-.5px;max-width:13ch;}
.mh .lede{color:#D9E2D6;font-size:18.5px;line-height:1.6;margin:20px 0 28px;max-width:36rem;}
.mh .actions{display:flex;flex-wrap:wrap;gap:14px;align-items:center;}
.mh .actions .btn.primary{font-size:16.5px;padding:15px 26px;}
.mh .actions a.quiet{color:#EFE9DB;font-weight:600;}
.mh .fine{font-size:13.5px;color:#AFC0AE;margin-top:14px;}
.club{background:#F7F2E7;color:var(--text);border-radius:14px;border:1px solid #CDBB86;box-shadow:0 24px 60px rgba(0,0,0,.35);overflow:hidden;}
.club-head{display:flex;align-items:center;gap:12px;padding:16px 20px;background:var(--pine);color:#EFE9DB;border-bottom:3px solid var(--gold);}
.club-head img{width:40px;height:40px;}
.club-head b{font-family:"Playfair Display",serif;font-size:17px;display:block;color:#fff;}
.club-head span{font-size:13px;color:#C9D6C7;}
.club ul{list-style:none;}
.club li{padding:14px 20px;border-bottom:1px solid var(--line);}
.club li a{font-family:"Playfair Display",serif;font-weight:700;font-size:17px;color:var(--pine);text-decoration:none;}
.club li small{display:block;color:var(--dim);font-size:13px;margin-top:1px;}
.club .live-status{margin:8px 0 0;}
.club .live-status .ls-note{display:none;}
.club-foot{padding:16px 20px;background:var(--panel);}
.club-foot p{font-size:14px;color:var(--dim);margin-bottom:12px;}
.club-foot .btn{width:100%;text-align:center;}
.fish{display:grid;grid-template-columns:repeat(3,1fr);gap:22px;margin-top:34px;}
.fish a{display:block;text-decoration:none;color:var(--text);background:#fff;border:1px solid var(--line);border-radius:14px;overflow:hidden;}
.fish img{width:100%;aspect-ratio:4/3;object-fit:cover;display:block;}
.fish div{padding:16px 18px 20px;}
.fish h3{font-size:21px;}
.fish p{color:var(--dim);font-size:15px;margin-top:6px;}
.fish .go{display:inline-block;margin-top:10px;color:var(--brick);font-weight:700;font-size:14.5px;}
.how{display:grid;grid-template-columns:repeat(3,1fr);gap:30px;margin-top:40px;counter-reset:step;}
.how figure{text-align:left;}
.how .phone{background:var(--ink);padding:10px;border-radius:30px;box-shadow:0 18px 40px rgba(22,36,27,.25);max-width:260px;margin:0 auto 20px;}
.how .phone img{display:block;width:100%;border-radius:22px;aspect-ratio:9/16;object-fit:cover;object-position:top;}
.how figcaption{max-width:300px;margin:0 auto;}
.how figcaption b{font-family:"Playfair Display",serif;font-size:20px;color:var(--pine);display:block;}
.how figcaption b::before{counter-increment:step;content:counter(step);display:inline-grid;place-items:center;width:28px;height:28px;border-radius:50%;background:var(--gold);color:#2f2507;font-family:"Public Sans",sans-serif;font-size:14px;font-weight:800;margin-right:10px;vertical-align:3px;}
.how figcaption p{color:var(--dim);margin-top:6px;font-size:15px;}
.split{display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:center;}
.split img{width:100%;border-radius:16px;aspect-ratio:5/4;object-fit:cover;display:block;}
.section .split h2{text-align:left;font-size:32px;}
.ticks{list-style:none;margin-top:20px;}
.ticks li{padding:12px 0 12px 34px;border-bottom:1px solid var(--line);position:relative;}
.ticks li::before{content:"";position:absolute;left:4px;top:18px;width:14px;height:8px;border-left:3px solid var(--pine);border-bottom:3px solid var(--pine);transform:rotate(-45deg);}
.ticks b{color:var(--pine);}
.ticks span{display:block;color:var(--dim);font-size:14.5px;margin-top:2px;}
.run{position:relative;color:#EFE9DB;background:var(--ink) url('${PHOTOS.ganaraska.src}') center/cover;}
.run::before{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(22,36,27,.9),rgba(22,36,27,.55));}
.run .wrap{position:relative;padding-top:64px;padding-bottom:64px;}
.run h2{color:#fff;font-size:34px;max-width:18ch;}
.run p{color:#D3DED1;max-width:560px;margin:14px 0 22px;font-size:17px;}
.run .spots{display:flex;flex-wrap:wrap;gap:10px;}
.run .spots a{color:#fff;border:1px solid rgba(239,233,219,.45);border-radius:22px;padding:7px 15px;text-decoration:none;font-weight:600;font-size:14.5px;}
.posts{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;margin-top:30px;}
.posts a{text-decoration:none;color:var(--text);}
.posts img{width:100%;aspect-ratio:3/2;object-fit:cover;border-radius:12px;display:block;}
.posts h3{font-size:17.5px;margin-top:12px;line-height:1.3;}
.posts p{color:var(--dim);font-size:14px;margin-top:4px;}
.sec-head{display:flex;justify-content:space-between;align-items:end;gap:20px;flex-wrap:wrap;}
.section .sec-head h2{text-align:left;}
.sec-head p{color:var(--dim);max-width:520px;margin-top:8px;}
@media(max-width:900px){.mh .wrap,.split{grid-template-columns:1fr;}.fish,.how{grid-template-columns:1fr;}.posts{grid-template-columns:1fr 1fr;}.mh .wrap{padding-top:48px;padding-bottom:56px;}}
@media(max-width:560px){.posts{grid-template-columns:1fr;}.mh .lede{font-size:17px;}}
</style>`;

// Members who were signed in before the home page moved to the front door
// have no "mkMember" flag yet; if this browser remembers a signed-in account,
// send them on to the app.
const RETURNING_MEMBER_SCRIPT = `<script>
(function(){try{ if(localStorage.getItem("mkMember")==="1") return;
  var r=indexedDB.open("river-intel-db",1); r.onupgradeneeded=function(){ r.transaction.abort(); };
  r.onsuccess=function(){ var db=r.result; if(!db.objectStoreNames.contains("kv")) return;
    var g=db.transaction("kv").objectStore("kv").get("me:last");
    g.onsuccess=function(){ var m=g.result; if(m&&m.user){ try{localStorage.setItem("mkMember","1");}catch(e){} location.replace("/?app"); } }; };
}catch(e){}})();
</script>`;

function homeBody() {
  const r = (id) => RIVERS.find((x) => x.id === id);
  const clubRow = (x) => `<li><a href="/rivers/${slug(x.river + " " + x.section)}/">${esc(x.river)}</a><small>${esc(x.section)}</small>
    <div class="live-status" data-reach="${esc(x.id)}" data-sp="${esc((x.species || []).join(","))}"><span class="st check">Checking today's season</span> <span class="ls-note"></span></div></li>`;
  const club = ["credit-lower", "grand-tw", "ganaraska"].map(r).filter(Boolean);
  const riverPreview = RIVERS.slice(0, 8).map((x) => `<a class="river-link" href="/rivers/${slug(x.river + " " + x.section)}/"><b>${esc(x.river)}</b><span>${esc(x.section)}</span></a>`).join("");
  const posts = [
    ["ontario-salmon-run-week-by-week", "Ontario salmon run, week by week", "When it starts, peaks and ends, and where to watch.", PHOTOS.salmon],
    ["where-to-find-brown-trout-in-ontario", "Where to find brown trout in Ontario", "The water they live in and the rivers known for them.", PHOTOS.brownTrout],
    ["ontario-fishing-seasons-trout-salmon", "Ontario fishing seasons for trout and salmon", "Zones, opening day and the stretches open all year.", PHOTOS.credit],
    ["brook-trout-small-creeks-ontario", "Brook trout in Ontario's small creeks", "Finding and fishing our native trout in cold water.", PHOTOS.brookTrout],
  ];
  return `
<section class="mh"><div class="wrap">
  <div>
    <h1>Know which river is fishing before you leave the house.</h1>
    <p class="lede">Every morning ${BRAND} checks live water temperature, flow and weather on 30+ Southern Ontario trout and salmon rivers, ranks them, confirms the official season for your stretch, and tells you what to tie on.</p>
    <div class="actions"><a class="btn primary" href="${APP_URL}">Start your 7 free days</a><a class="quiet" href="${SIGNIN_URL}">Sign in</a></div>
    <p class="fine">No charge for 7 days. Then $5.00 a month on the yearly plan. Cancel any time.</p>
  </div>
  <aside class="club" aria-label="This morning's season status">
    <div class="club-head"><img src="/crest.png" alt=""/><div><b>This morning on the water</b><span>Official Ontario season status, checked twice a day</span></div></div>
    <ul>${club.map(clubRow).join("")}</ul>
    <div class="club-foot"><p>Members also see each river's score, water temperature, flow and today's fly.</p><a class="btn primary" href="${APP_URL}">See today's scores</a></div>
  </aside>
</div></section>

<section class="section"><div class="wrap">
  <div class="sec-head"><div><h2>Three fish, three kinds of water</h2><p>Southern Ontario is one of the best trout and salmon regions in North America, if you're on the right water on the right day.</p></div></div>
  <div class="fish">
    <a href="/blog/brook-trout-small-creeks-ontario/"><img src="${PHOTOS.brookTrout.sm}" alt="${esc(PHOTOS.brookTrout.alt)}" loading="lazy"/><div><h3>Brook trout</h3><p>Ontario's native trout, in small spring-fed creeks that stay cold all summer.</p><span class="go">Finding creek brookies</span></div></a>
    <a href="/blog/where-to-find-brown-trout-in-ontario/"><img src="${PHOTOS.brownTrout.sm}" alt="${esc(PHOTOS.brownTrout.alt)}" loading="lazy"/><div><h3>Brown trout</h3><p>Wary fish of tailwaters, undercut banks and fallen timber. Best at first and last light.</p><span class="go">Where browns live</span></div></a>
    <a href="/steelhead/"><img src="${PHOTOS.steelhead.sm}" alt="${esc(PHOTOS.steelhead.alt)}" loading="lazy"/><div><h3>Steelhead and salmon</h3><p>Lake-run fish that push up the tributaries on fresh rain, from August through spring.</p><span class="go">Steelhead rivers and seasons</span></div></a>
  </div>
</div></section>

<section class="section alt" id="how"><div class="wrap">
  <h2>How a morning with the app goes</h2>
  <p class="sub">Two minutes over coffee, and you know where you're going.</p>
  <div class="how">
    <figure><div class="phone"><img src="/img/app/rivers-ranked.jpg" alt="The app ranking rivers by today's fishing opportunity" loading="lazy"/></div>
      <figcaption><b>See every river ranked</b><p>Rivers near you, scored 0 to 100 from live water temperature, flow, pressure and weather, with the official season shown on each.</p></figcaption></figure>
    <figure><div class="phone"><img src="/img/app/river-report.jpg" alt="A river report on the map with conditions and likely fish" loading="lazy"/></div>
      <figcaption><b>Open the river's report</b><p>Conditions, the fish likely holding there, parking and directions, all on one screen.</p></figcaption></figure>
    <figure><div class="phone"><img src="/img/app/flies.jpg" alt="Today's recommended approach and flies for a river" loading="lazy"/></div>
      <figcaption><b>Tie on the right fly</b><p>The approach for today's water, the flies and sizes to use, and how to fish them.</p></figcaption></figure>
  </div>
  <p style="text-align:center;margin-top:34px;"><a class="btn primary" href="${APP_URL}">Try it free for 7 days</a></p>
</div></section>

<section class="section" id="features"><div class="wrap split">
  <img src="${PHOTOS.flyFishers.sm}" alt="${esc(PHOTOS.flyFishers.alt)}" loading="lazy"/>
  <div>
    <h2>Everything a member gets</h2>
    <ul class="ticks">
      <li><b>Today's season, from the official rules</b><span>Synced from the Ontario Fishing Regulations Summary twice a day, stretch by stretch, with a link to the exact rule.</span></li>
      <li><b>Scout rivers and creeks near you</b><span>Find new water within your radius, ranked with open water first.</span></li>
      <li><b>Parking and walk-in routes</b><span>The nearest public parking and the walk to the water.</span></li>
      <li><b>Alerts when a saved river turns prime</b><span>One heads-up when it happens, never a flood of them.</span></li>
      <li><b>Your catch log and private notes</b><span>Your spots stay yours. We never share exact locations.</span></li>
    </ul>
    <p style="margin-top:24px;"><a class="btn primary" href="${APP_URL}">Start your 7 free days</a></p>
  </div>
</div></section>

<section class="section alt" id="accuracy"><div class="wrap" style="max-width:760px;">
  <h2>How accurate is the score?</h2>
  <p class="sub">We check it against what members actually catch. After a trip, members tell us how it went in ten seconds, blank days included, and we publish how often fish were caught on days we scored high and low.</p>
  <p class="acc-line" style="text-align:center;margin-top:16px;font-weight:600;color:var(--pine)">Collecting trip reports now. Results appear here once 300 trips are in.</p>
</div></section>
<script>
(function(){ fetch("/bk/api/score-accuracy").then(function(r){return r.ok?r.json():null}).then(function(d){ if(!d) return;
  var el=document.querySelector(".acc-line"); if(!el) return;
  if(d.ready){ el.innerHTML=d.bands.map(function(b){return "Scored "+b.label+": fish caught on "+b.caughtRate+"% of "+b.trips+" trips";}).join("<br>"); }
  else { el.textContent=d.trips+" of "+d.target+" trip reports collected so far. Results appear here once 300 trips are in."; }
}).catch(function(){}); })();
</script>

<section class="run"><div class="wrap">
  <h2>Salmon run season, late August to November</h2>
  <p>Chinook push up Lake Ontario rivers on every fall rain. Our guides show where to watch, when it peaks, and which stretches are open to fish.</p>
  <div class="spots">${SALMON_SPOTS.map((x) => `<a href="/salmon-run/${x.slug}/">${esc(x.place)}</a>`).join("")}<a href="/salmon-run/">All salmon run spots</a></div>
</div></section>

<section class="section"><div class="wrap">
  <div class="sec-head"><div><h2>Rivers we cover</h2><p>Trout, steelhead and salmon water across Southern Ontario and the Great Lakes tributaries. Every guide shows today's season status.</p></div><a class="btn ghost" href="/rivers/">All ${RIVERS.length} river guides</a></div>
  <div class="rivers-grid">${riverPreview}</div>
</div></section>

<section class="section alt"><div class="wrap">
  <div class="sec-head"><div><h2>From the blog</h2><p>Seasons, techniques and river know-how, written for Ontario water.</p></div><a class="btn ghost" href="/blog/">Read the blog</a></div>
  <div class="posts">${posts.map(([slugp, t, d, ph]) => `<a href="/blog/${slugp}/"><img src="${ph.sm}" alt="${esc(ph.alt)}" loading="lazy"/><h3>${esc(t)}</h3><p>${esc(d)}</p></a>`).join("")}</div>
</div></section>

<section class="section" id="pricing"><div class="wrap">
  <h2>Membership</h2>
  <p class="sub">Every plan starts with 7 free days and every feature. Cancel any time.</p>
  <div class="price">
    <div class="plan"><div class="amt">$9.99</div><div class="per">per month</div><p style="color:var(--dim);margin:14px 0;">Billed monthly.</p><a class="btn ghost" href="${APP_URL}">Start free</a></div>
    <div class="plan best"><div class="tag">Save 50%</div><div class="amt">$5.00</div><div class="per">per month, billed $59.99 a year</div><p style="color:var(--dim);margin:14px 0;">Half the price of paying monthly.</p><a class="btn primary" href="${APP_URL}">Start free</a></div>
  </div>
</div></section>

<section class="section alt"><div class="wrap">
  <h2>Questions</h2>
  <div class="faq">
    <details><summary>What is ${BRAND}?</summary><p>An app for Southern Ontario trout and salmon anglers. Each morning it ranks rivers on live conditions, shows the official season for each stretch, and suggests the technique and flies for the day.</p></details>
    <details><summary>Where does it work?</summary><p>Rivers and creeks across Southern Ontario, from the Lake Ontario and Lake Erie tributaries to Georgian Bay and Lake Huron. You can also scout new water anywhere within your chosen radius.</p></details>
    <details><summary>Is it for beginners?</summary><p>Yes. It tells you where to go, when it's good and what to tie on in plain language, and gives experienced anglers the live numbers behind it.</p></details>
    <details><summary>How accurate are the seasons?</summary><p>They come from the official Ontario Fishing Regulations Summary, checked twice a day, with a link to the exact rule. Always confirm before you fish.</p></details>
    <details><summary>Do you share my fishing spots?</summary><p>Never. Your exact locations and notes stay private. Community activity is only shown at the river level.</p></details>
    <details><summary>How much is it?</summary><p>$9.99 a month, or $5.00 a month on the yearly plan (billed $59.99 a year). Both start with 7 free days.</p></details>
  </div>
</div></section>`;
}

// ---- pillar / guide pages (target broad Ontario fishing searches) ----
const riverGrid = (list) => `<div class="rivers-grid">${list.slice(0, 12).map((r) => `<a class="river-link" href="/rivers/${slug(r.river + " " + r.section)}/"><b>${esc(r.river)}</b><span>${esc(r.section)}</span></a>`).join("")}</div>`;

const GUIDES = [
  {
    slug: "steelhead-fishing-ontario",
    title: `Steelhead Fishing in Ontario: Rivers, Runs & Tactics`,
    desc: "Where and when to fish steelhead (lake-run rainbow trout) in Southern Ontario: the best Great Lakes tributaries, run timing, flies and tactics.",
    h1: "Steelhead fishing in Ontario",
    filter: (r) => r.species.includes("STL") || r.species.includes("RBT"),
    intro: [
      "Steelhead, the lake-run form of rainbow trout, are the prize of Southern Ontario's Great Lakes tributaries. Each spring and fall they push out of Lakes Ontario, Erie and Huron into the rivers, drawing fly and float anglers to famous water like the Ganaraska, Saugeen, Credit and Niagara.",
      "The catch is timing. Steelhead move on fresh water: a rain that bumps and colours a river, then drops and clears, is the classic window. Fish the wrong day and a river is dead; fish the drop and it can be the day of the season.",
    ],
    sections: [
      { h: "When steelhead run in Ontario", p: "Fall run fish start entering the tributaries from late September through December, with holdover fish through winter where seasons stay open. The spring run, the biggest push, comes March through May as fish stage to spawn. Many lower tributary reaches carry extended seasons into December; upper reaches and sanctuaries close, so always confirm the current regulations for the exact water." },
      { h: "How to catch them", p: "Drift eggs, nymphs and stoneflies through runs and tailouts under a float or on a tight line, and swing streamers when the water is stained. Fish hold in the deeper slots and the seams beside faster water. On low, clear water, downsize and lengthen your leader; on high, stained water, go bigger and brighter." },
      { h: "Best steelhead rivers", links: true },
    ],
    faqs: [
      { q: "When is the best time for steelhead in Ontario?", a: "The spring run (March to May) is the largest, and the fall run (late September to December) is prime on fresh, dropping water. Muddy York Fishing scores each river daily so you fish the right window." },
      { q: "What's the difference between steelhead and rainbow trout?", a: "They're the same species. Steelhead are the lake-run form that spend part of their life in the Great Lakes and run the tributaries to spawn, growing much larger than resident stream rainbows." },
    ],
  },
  {
    slug: "salmon-run-ontario",
    title: `Salmon Run in Ontario: Chinook & Coho Rivers and Timing`,
    desc: "The Ontario fall salmon run: when Chinook and Coho salmon run the Great Lakes tributaries, the best rivers to fish, and how to target them.",
    h1: "The Ontario salmon run",
    filter: (r) => r.species.includes("CHN") || r.species.includes("COH"),
    intro: [
      "Every fall, Chinook (king) and Coho salmon leave the Great Lakes and surge up Southern Ontario's tributaries to spawn, one of the most dramatic fisheries in the province. Rivers like the Credit, Humber, Ganaraska, Saugeen and Niagara fill with big, aggressive fish.",
      "The run is short and weather-driven. A cool, rainy stretch in September and October pulls fresh fish in on every push; a warm, dry spell can stall it. Reading the water and the rain is everything.",
    ],
    sections: [
      { h: "When is the Ontario salmon run?", p: "Chinook typically run from late August through October, peaking in September; Coho follow slightly later into October and November. Fresh rain that bumps the rivers triggers each new push, and first light is prime in the lower-river pools." },
      { h: "How to fish the run", p: "Target deep holding pools, log-jam tailouts and current breaks in the lower river. Swing large, bright streamers and spey flies slowly through the lies, or drift roe and heavy nymphs. These are powerful fish on a fresh push, heavier tackle and stout leaders earn their keep." },
      { h: "Best salmon rivers", links: true },
    ],
    faqs: [
      { q: "When do salmon run in Ontario?", a: "Chinook salmon run from late August into October (peak September); Coho a little later into November. Runs surge on fresh rain, Muddy York Fishing tracks the rivers daily so you catch the push." },
      { q: "Where can I see the salmon run near Toronto?", a: "The Credit, Humber and Rouge rivers all get strong fall runs within reach of Toronto. Open the river guides for access and today's conditions." },
    ],
  },
  {
    slug: "fly-fishing-near-toronto",
    title: `Fly Fishing Near Toronto: Rivers, Trout & Salmon`,
    desc: "The best rivers to fly fish near Toronto for trout, steelhead and salmon, from the Credit and Humber to the Rouge, with live conditions and access.",
    h1: "Fly fishing near Toronto",
    filter: (r) => /credit|humber|rouge|bronte|sixteen|don|duffins/i.test(r.river),
    intro: [
      "You don't have to drive north for good water. Within an hour of Toronto, the Credit, Humber, Rouge, Bronte and Sixteen Mile hold resident brown and brook trout through the season and fill with steelhead and salmon on the spring and fall runs.",
      "These urban and near-urban rivers change fast with rainfall and rise and fall with the seasonal runs, so knowing which one is fishing today saves a wasted trip.",
    ],
    sections: [
      { h: "The best rivers near Toronto", links: true },
      { h: "What you'll catch", p: "Resident brown and brook trout in the cooler upper and middle reaches through spring to fall; lake-run steelhead and Chinook/Coho salmon in the lower reaches on the migratory runs. The Credit is the classic all-rounder, the Humber and Rouge get strong fall runs, and Bronte and Sixteen Mile are productive lower-river tributaries." },
      { h: "Fish the right day", p: "Muddy York Fishing reads live water temperature, flow and weather on each of these rivers every morning, ranks them, and tells you where to go, when it's prime, and what fly to tie on, plus parking and the walk to the water." },
    ],
    faqs: [
      { q: "Where can I fly fish near Toronto?", a: "The Credit, Humber, Rouge, Bronte Creek and Sixteen Mile Creek are all within about an hour of the city and hold trout, steelhead and salmon depending on the season." },
      { q: "Do I need a licence to fish in Ontario?", a: "Yes. An Ontario Outdoors Card with a fishing licence is required for most anglers. Always check the current Ontario fishing regulations for the water you plan to fish." },
    ],
  },
  {
    slug: "brown-trout-fishing-ontario",
    title: `Brown Trout Fishing in Ontario: Rivers & Seasons`,
    desc: "Brown trout fishing in Southern Ontario: resident stream browns and lake-run browns, the best rivers and tailwaters, seasons and tactics.",
    h1: "Brown trout fishing in Ontario",
    filter: (r) => r.species.includes("BNT") || r.species.includes("BNTr"),
    intro: [
      "Brown trout are Southern Ontario's wariest, most rewarding stream fish. Wild resident browns hold in cold headwaters and tailwaters like the Grand below Shand Dam and the upper Credit, while lake-run browns run the Great Lakes tributaries in spring and fall.",
      "Browns reward a careful approach: light tippet, a quiet wade, and reading the water at first and last light when the biggest fish feed.",
    ],
    sections: [
      { h: "Resident vs. lake-run browns", p: "Resident stream browns live in the river year-round and fish through the general season (roughly the fourth Saturday of April to September 30). Lake-run browns, bigger, silver fish from the lakes, run the lower tributaries in spring and fall, often alongside steelhead. Cold tailwaters like the Grand can fish for browns almost year-round where regulations allow." },
      { h: "How to catch brown trout", p: "Match the hatch with dries and a dry-dropper in prime temps, nymph the seams in cooler water, and swing or strip streamers at first and last light for the larger fish. Downsize and lengthen leaders on low, clear water." },
      { h: "Best brown trout rivers", links: true },
    ],
    faqs: [
      { q: "Where is the best brown trout fishing in Ontario?", a: "The Grand River tailwater below Shand Dam is Ontario's premier resident brown-trout water; the upper Credit, Conestogo tailwater and many cold tributaries also hold wild browns, and the lower Great Lakes tributaries get lake-run browns." },
      { q: "When is brown trout season in Ontario?", a: "Resident stream trout generally open from the fourth Saturday of April to September 30, with extended fall seasons on named migratory rivers. Confirm the exact reach in the current Ontario regulations, Muddy York Fishing shows the season status for each river." },
    ],
  },
  {
    slug: "float-fishing-for-steelhead",
    title: `Float Fishing for Steelhead: Setup, Gear & Technique`,
    desc: "How to float fish for steelhead in Ontario's rivers: centerpin and float rods, the float rig and shot pattern, baits and beads, and reading the water.",
    h1: "Float fishing for steelhead",
    filter: (r) => r.species.includes("STL") || r.species.includes("RBT"),
    intro: [
      "Float fishing is the deadliest way to present a bait to steelhead in a river, and it's why you see so many centerpin and float rods on the Ganaraska, Saugeen and Credit each run. A float lets you drift a bait at the exact speed of the current, drag-free, right along the bottom where steelhead hold, the presentation they can't resist.",
      "It looks technical, but the core idea is simple: get your bait down, drift it naturally through the holding water, and watch the float for the take.",
    ],
    sections: [
      { h: "The gear", p: "Two setups dominate. A centerpin reel on a 12 to 13' float rod gives the longest, most natural drag-free drifts and is the gold standard for dedicated steelheaders. A float (spinning) setup on a similar long rod is easier to learn and covers most water. Either way, the long rod is what mends line and controls the drift." },
      { h: "The float rig", p: "Run the mainline to a float sized to the water (bigger and buoyant for heavy flow, small for slow, clear water), then a shot pattern below it, heavier shot up top tapering to smaller shot near the hook so the bait leads naturally. Below the shot, tie a lighter fluorocarbon leader (roughly 6 to 10 lb, lighter on clear water) to your hook. Set the float depth so the bait ticks bottom: as a rule of thumb, start at about 1.5× the water's depth and adjust until you occasionally touch." },
      { h: "Baits, beads and flies", p: "Roe bags are the classic steelhead bait; plastic beads (pegged above the hook) and soft plastics have become just as popular and are cleaner to fish. Nymphs, egg patterns and small jigs all drift well under a float too. Match colour to clarity, natural and subtle in clear water, brighter (orange, chartreuse, pink) in stain." },
      { h: "Reading the water & the drift", p: "Steelhead hold in the deeper slots, the tailouts of pools, and the seams beside faster water. Cast up and across, let the float settle, then keep the line off the water and mend so the float drifts at the current's speed, never dragging. When the float dips, hesitates or shoots under, set. Work a run in lanes, covering the near seam before the far one." },
      { h: "Best rivers to float fish", links: true },
    ],
    faqs: [
      { q: "What float rig do I use for steelhead?", a: "A buoyant float sized to the flow, a tapering shot pattern below it (heavier up, lighter near the hook), and a light fluorocarbon leader to the hook. Set the depth so the bait ticks bottom, about 1.5× the water depth to start." },
      { q: "Do I need a centerpin reel to float fish?", a: "No. A centerpin gives the longest drag-free drifts and is ideal, but a float setup on a long spinning rod catches plenty of steelhead and is easier to learn." },
      { q: "What's the best bait for steelhead?", a: "Roe bags, pegged beads and soft plastics are all top steelhead baits, along with egg patterns, nymphs and small jigs under a float. Match colour to water clarity, natural in clear water, brighter in stain." },
    ],
  },
  {
    slug: "ontario-trout-opener",
    title: `Ontario Trout Opener 2027: April 24 & Where to Fish`,
    desc: "Ontario's trout opener is Saturday, April 24, 2027 (the fourth Saturday in April). What opens by zone, and the best rivers to fish on opening day.",
    h1: "The Ontario trout opener: Saturday, April 24, 2027",
    filter: (r) => r.species.includes("BKT") || r.species.includes("BNT"),
    intro: [
      "For Southern Ontario anglers, the trout opener is the real start of the season. Across most of the province, the general stream-trout season opens on the fourth Saturday in April, the first legal day to target brook and brown trout in most rivers and streams.",
      "It's more than a date. Opening weekend puts hungry, un-pressured fish in cold, high spring water, and it's a tradition that draws anglers back to the same runs year after year.",
    ],
    sections: [
      { h: "When does trout season open in Ontario?", p: "In the Southern divisions the general stream-trout (brook and brown trout) season runs from the fourth Saturday in April through September 30. Dates and exceptions vary by Fisheries Management Zone (FMZ), and many Great Lakes tributaries carry extended migratory seasons or spring sanctuary closures that override the zone default, so always confirm the exact reach before you go. Muddy York Fishing shows the current season status (open, closed, or check regs) for each river." },
      { h: "Where to fish on opening day", p: "Cold, spring-fed headwaters and tailwaters fish best early, while the water is still cold and often high. Tailwaters like the Grand below Shand Dam and the Conestogo run clearer and steadier than freestones after spring rain. Focus on the deeper slots and seams, and fish through the warmest part of the day." },
      { h: "Best rivers for the opener", links: true },
    ],
    faqs: [
      { q: "When is the trout opener in Ontario?", a: "In 2027 it is Saturday, April 24. In most of Southern Ontario the general stream-trout season opens on the fourth Saturday in April and runs to September 30. Some zones and waters differ, so confirm the current Ontario regulations for the exact river." },
      { q: "Do I need a licence for the trout opener?", a: "Yes. A valid Ontario fishing licence (with an Outdoors Card) is required. Check the current regulations for season dates, limits and any sanctuary closures on the water you plan to fish." },
      { q: "What's the best bait or fly for opening day?", a: "Cold, high spring water favours getting down: weighted nymphs and small streamers fished deep and slow, plus egg patterns where migratory fish are still around. Muddy York Fishing recommends the technique and flies for each river based on the day's conditions." },
    ],
  },
];

const guideCta = (label) => `<div class="callout"><h3>Fish Southern Ontario on the right day</h3><p style="color:var(--dim);margin-bottom:14px;">Live conditions, the fly &amp; technique for today, depth &amp; likely fish, and access for 30+ rivers. Free for 7 days.</p><a class="btn primary" href="${APP_URL}">${label}</a></div>`;

function guideBody(g) {
  const rivers = RIVERS.filter(g.filter);
  const url = `${SITE_URL}/guides/${g.slug}/`;
  const secHtml = g.sections.map((s) => s.links
    ? `<h2>${esc(s.h)}</h2><p>These Southern Ontario rivers are among the best, open any for its full guide and today's live conditions:</p>${riverGrid(rivers)}`
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
  ${guideCta("Start your free 7-day trial")}
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
    title: `Lake Ontario Tributary Fishing: Steelhead, Salmon & Trout`,
    desc: "The best Lake Ontario tributaries for steelhead, salmon and trout: the Credit, Humber, Rouge, Ganaraska, Bowmanville and more, with seasons and access.",
    h1: "Lake Ontario tributary fishing",
    filter: (r) => /Lake Ontario/i.test(r.region),
    intro: [
      "Lake Ontario's tributaries are Southern Ontario's steelhead-and-salmon highway. From the Credit and Humber on the west end to the Ganaraska, Bowmanville and Wilmot to the east, these rivers fill with migratory fish each spring and fall, and many are within an hour of Toronto.",
      "They're rain-driven: each fresh push pulls new fish up from the lake, then the drop and clear is prime. Knowing which tributary is fishing today is the difference between a banner day and a wasted drive.",
    ],
  },
  {
    slug: "georgian-bay-lake-huron",
    title: `Georgian Bay & Lake Huron Fishing: Steelhead & Salmon`,
    desc: "Fishing the Georgian Bay and Lake Huron tributaries (the Nottawasaga, Saugeen, Maitland, Beaver, Bighead and Sauble) for steelhead, salmon and trout.",
    h1: "Georgian Bay & Lake Huron tributary fishing",
    filter: (r) => /Georgian Bay|Lake Huron/i.test(r.region),
    intro: [
      "The rivers flowing into Georgian Bay and Lake Huron hold some of Ontario's most storied steelhead and salmon water. The Saugeen and Maitland draw anglers from across the province, while the Nottawasaga, Beaver, Bighead and Sauble each run their own spring and fall migrations.",
      "This is bigger, wilder water than the urban tributaries, and it rewards anglers who time the runs and read fresh, dropping flows.",
    ],
  },
  {
    slug: "grand-river",
    title: `Grand River Fishing: Brown Trout, Steelhead & Salmon`,
    desc: "Fishing the Grand River watershed: the world-class brown-trout tailwater below Shand Dam, the lower river to Lake Erie, and the Conestogo tailwater.",
    h1: "Grand River fishing",
    filter: (r) => /grand|conestogo/i.test(r.river),
    intro: [
      "The Grand is Ontario's signature trout river. The tailwater below Shand Dam runs cold and steady, holding wild brown trout that make it one of the best resident-trout fisheries in the country, while the lower river down to Lake Erie draws a strong run of migratory rainbow and brown trout.",
      "Because the tailwater is dam-controlled, it fishes when freestones are blown out or too warm, a reliable option across the season.",
    ],
  },
  {
    slug: "toronto-area-rivers",
    title: `Toronto-Area River Fishing: Trout, Steelhead & Salmon`,
    desc: "Fishing the rivers in and around Toronto (the Credit, Humber, Rouge, Bronte, Sixteen Mile and Duffins) for trout, steelhead and salmon.",
    h1: "Toronto-area river fishing",
    filter: (r) => /credit|humber|rouge|bronte|sixteen|duffins|\bdon\b/i.test(r.river),
    intro: [
      "You don't have to leave the GTA for real fishing. The Credit, Humber and Rouge run right through the western and eastern suburbs, while Bronte Creek, Sixteen Mile Creek and Duffins Creek sit a short drive out, all holding resident trout through the season and filling with steelhead and salmon on the spring and fall runs.",
      "These rivers change quickly with city rain, so the same creek can be prime one morning and blown out the next. Knowing which one is fishing today turns a lunch-break session into a real shot at fish.",
    ],
  },
  {
    slug: "niagara-region",
    title: `Niagara Region Fishing: Lower Niagara & Twelve Mile Creek`,
    desc: "Fishing the Niagara region: the powerful lower Niagara River for steelhead, brown trout and lake trout, plus cold-water Twelve Mile Creek near St. Catharines.",
    h1: "Niagara region fishing",
    filter: (r) => /Niagara/i.test(r.region),
    intro: [
      "The Niagara region packs big-water drama into a small area. The lower Niagara River below the falls, through the whirlpool and Devil's Hole, is a world-class drift fishery for steelhead, brown trout and lake trout, while Twelve Mile Creek near St. Catharines offers a cold, wild-trout contrast.",
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
  <p>${BRAND} reads live water temperature, flow and weather on every one of these rivers each morning, ranks them by opportunity, and tells you where to go, when it's prime and what fly to tie on, plus parking and the walk to the water, and the current Ontario season status for each reach.</p>
  <h2>Frequently asked</h2>
  <details><summary>What can I catch in this region?</summary><p>These waters hold ${esc(species.join(", "))}. ${BRAND} shows which are most active today based on the season and live conditions.</p></details>
  <details><summary>Do I need a fishing licence in Ontario?</summary><p>Yes. A valid Ontario fishing licence with an Outdoors Card is required for most anglers. Always confirm the current regulations, seasons and any sanctuary closures for the exact water.</p></details>
  <p style="margin-top:18px;"><a href="/rivers/">Browse all ${RIVERS.length}+ Southern Ontario rivers →</a> · <a href="/guides/">Ontario fishing guides →</a></p>
  ${guideCta("Start your free 7-day trial")}
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
  title: withBrand("Ontario Fishing App: River Conditions & Regulations"),
  description: "Daily river intelligence for Southern Ontario anglers: live conditions, opportunity scores, fly picks and access for 30+ trout & salmon rivers. Start free.",
  canonical: SITE_URL + "/fishing/", body: homeBody(), extraHead: HOME_CSS, tail: LIVE_STATUS_SCRIPT + RETURNING_MEMBER_SCRIPT, stickyCta: "Start 7 free days",
  ogImage: SITE_URL + PHOTOS.elora.src,
  schema: { "@context": "https://schema.org", "@type": "SoftwareApplication", name: BRAND, applicationCategory: "LifestyleApplication",
    operatingSystem: "Web, iOS", offers: { "@type": "Offer", price: "9.99", priceCurrency: "CAD" }, url: SITE_URL },
}));

const urls = [SITE_URL + "/", SITE_URL + "/fishing/", SITE_URL + "/rivers/"];
for (const r of RIVERS) {
  const s = slug(r.river + " " + r.section);
  const dir = path.join(OUT, "rivers", s);
  fs.mkdirSync(dir, { recursive: true });
  const pg = riverPage(r);
  fs.writeFileSync(path.join(dir, "index.html"), page({
    title: withBrand(pg.title), description: pg.description, canonical: `${SITE_URL}/rivers/${s}/`,
    body: pg.body, schema: pg.schema, stickyCta: pg.stickyCta, tail: LIVE_STATUS_SCRIPT, photo: riverPhoto(r), ogImage: SITE_URL + riverPhoto(r).src,
  }));
  urls.push(`${SITE_URL}/rivers/${s}/`);
}

// salmon run hub + viewing spots
fs.mkdirSync(path.join(OUT, "salmon-run"), { recursive: true });
{
  const hub = salmonHub();
  fs.writeFileSync(path.join(OUT, "salmon-run", "index.html"), page({ title: withBrand(hub.title), description: hub.description,
    canonical: `${SITE_URL}/salmon-run/`, body: hub.body, schema: hub.schema, stickyCta: hub.stickyCta, tail: RUN_STATUS_SCRIPT, photo: { ...PHOTOS.salmon, pos: "center 40%" }, ogImage: SITE_URL + PHOTOS.salmon.src }));
  urls.push(`${SITE_URL}/salmon-run/`);
  for (const sp of SALMON_SPOTS) {
    const dir = path.join(OUT, "salmon-run", sp.slug); fs.mkdirSync(dir, { recursive: true });
    const pg = salmonSpotPage(sp);
    fs.writeFileSync(path.join(dir, "index.html"), page({ title: withBrand(pg.title), description: pg.description,
      canonical: `${SITE_URL}/salmon-run/${sp.slug}/`, body: pg.body, schema: pg.schema, stickyCta: pg.stickyCta, tail: LIVE_STATUS_SCRIPT + RUN_STATUS_SCRIPT,
      photo: sp.slug.includes("ganaraska") ? PHOTOS.ganaraska : sp.slug === "credit-river-mississauga" ? PHOTOS.credit : { ...PHOTOS.salmon, pos: "center 40%" }, ogImage: SITE_URL + PHOTOS.salmon.src }));
    urls.push(`${SITE_URL}/salmon-run/${sp.slug}/`);
  }
}

// steelhead hub + one page per steelhead river
fs.mkdirSync(path.join(OUT, "steelhead"), { recursive: true });
{
  const hub = steelheadHub();
  fs.writeFileSync(path.join(OUT, "steelhead", "index.html"), page({ title: withBrand(hub.title), description: hub.description,
    canonical: `${SITE_URL}/steelhead/`, body: hub.body, schema: hub.schema, stickyCta: "Start free", photo: PHOTOS.steelhead, ogImage: SITE_URL + PHOTOS.steelhead.src }));
  urls.push(`${SITE_URL}/steelhead/`);
  steelheadRivers().forEach((g, gi) => {
    const dir = path.join(OUT, "steelhead", g.slug); fs.mkdirSync(dir, { recursive: true });
    const pg = steelheadPage(g);
    const ph = [PHOTOS.wading, PHOTOS.steelhead, PHOTOS.flyFishers][gi % 3];
    fs.writeFileSync(path.join(dir, "index.html"), page({ title: withBrand(pg.title), description: pg.description,
      canonical: `${SITE_URL}/steelhead/${g.slug}/`, body: pg.body, schema: pg.schema, stickyCta: pg.stickyCta, tail: LIVE_STATUS_SCRIPT, photo: ph, ogImage: SITE_URL + ph.src }));
    urls.push(`${SITE_URL}/steelhead/${g.slug}/`);
  });
}

// "fishing spots in [town]"
fs.mkdirSync(path.join(OUT, "fishing-spots"), { recursive: true });
for (const t of TOWNS) {
  const dir = path.join(OUT, "fishing-spots", t.slug); fs.mkdirSync(dir, { recursive: true });
  const pg = townPage(t);
  fs.writeFileSync(path.join(dir, "index.html"), page({ title: withBrand(pg.title), description: pg.description,
    canonical: `${SITE_URL}/fishing-spots/${t.slug}/`, body: pg.body, schema: pg.schema, stickyCta: pg.stickyCta, tail: LIVE_STATUS_SCRIPT,
    photo: [PHOTOS.wading, PHOTOS.flyFishers, PHOTOS.creek, PHOTOS.ganaraska][TOWNS.indexOf(t) % 4], ogImage: SITE_URL + PHOTOS.wading.src }));
  urls.push(`${SITE_URL}/fishing-spots/${t.slug}/`);
}
fs.writeFileSync(path.join(OUT, "fishing-spots", "index.html"), page({
  title: withBrand("Ontario Fishing Spots by Town: Rivers Near You"),
  description: "Find trout, steelhead and salmon rivers near Toronto, Mississauga, Oakville, Hamilton, Durham, Barrie and more, with official seasons. Try it free.",
  canonical: `${SITE_URL}/fishing-spots/`,
  body: `<section class="section"><div class="wrap"><article class="prose"><h1>Ontario fishing spots by town</h1>
<p>Pick your town to see the closest trout, steelhead and salmon rivers, what's in them and whether they're open today.</p>
<div class="rivers-grid">${TOWNS.map((t) => `<a class="river-link" href="/fishing-spots/${t.slug}/"><b>${esc(t.name)}</b><span>${esc(t.title.split(":")[1] ? t.title.split(":")[1].trim() : "Rivers nearby")}</span></a>`).join("")}</div>
<p style="margin-top:18px;"><a href="/rivers/">All river guides →</a> · <a href="/salmon-run/">Ontario salmon run →</a> · <a href="/regulations/">Regulations by zone →</a></p></article></div></section>`,
}));
urls.push(`${SITE_URL}/fishing-spots/`);

// zone regulation pages are rendered by the backend; list them for search engines
urls.push(`${SITE_URL}/regulations/`);
for (let z = 1; z <= 20; z++) urls.push(`${SITE_URL}/regulations/zone-${z}/`);

// rivers index (grouped by region)
const byRegion = {};
for (const r of RIVERS) (byRegion[r.region] ||= []).push(r);
const riversIndexBody = `
<section class="section"><div class="wrap">
  <h1 style="text-align:left;font-size:30px;">Ontario trout and salmon rivers we cover</h1>
  <p style="color:var(--dim);max-width:700px;margin-top:8px;">${RIVERS.length}+ trout, steelhead and salmon rivers across Southern Ontario. Tap any river for its guide, then open the app for today's live conditions.</p>
  ${Object.keys(byRegion).sort().map((reg) => `<h3 style="margin:28px 0 6px;font-size:18px;">${esc(reg)}</h3><div class="rivers-grid">${byRegion[reg].map((r) => `<a class="river-link" href="/rivers/${slug(r.river + " " + r.section)}/"><b>${esc(r.river)}</b><span>${esc(r.section)}</span></a>`).join("")}</div>`).join("")}
  <h3 style="margin:30px 0 6px;font-size:18px;">Fishing regions</h3>
  <div class="rivers-grid">${REGIONS.map((g) => `<a class="river-link" href="/regions/${g.slug}/"><b>${esc(g.h1)}</b><span>${esc(g.desc).slice(0, 60)}…</span></a>`).join("")}</div>
  <h3 style="margin:30px 0 6px;font-size:18px;">Ontario fishing guides</h3>
  <div class="rivers-grid">${GUIDES.map((g) => `<a class="river-link" href="/guides/${g.slug}/"><b>${esc(g.h1)}</b><span>${esc(g.desc).slice(0, 64)}…</span></a>`).join("")}</div>
  <div class="callout" style="margin-top:36px;"><h3>Get today's conditions on all of them</h3><a class="btn primary" href="${APP_URL}">Start free</a></div>
</div></section>`;
fs.writeFileSync(path.join(OUT, "rivers", "index.html"), page({
  title: withBrand(`Ontario Trout & Salmon Rivers: ${RIVERS.length} River Guides`),
  description: `Guides to ${RIVERS.length}+ Southern Ontario trout, steelhead and salmon rivers, species, seasons and access. Live conditions in the ${BRAND} app.`,
  canonical: SITE_URL + "/rivers/", body: riversIndexBody,
}));

// guide / pillar pages + guides index
fs.mkdirSync(path.join(OUT, "guides"), { recursive: true });
for (const g of GUIDES) {
  const dir = path.join(OUT, "guides", g.slug);
  fs.mkdirSync(dir, { recursive: true });
  const { body, schema } = guideBody(g);
  const gph = { "steelhead-fishing-ontario": PHOTOS.steelhead, "salmon-run-ontario": { ...PHOTOS.salmon, pos: "center 40%" }, "fly-fishing-near-toronto": PHOTOS.flyFishers,
    "brown-trout-fishing-ontario": PHOTOS.brownTrout, "float-fishing-for-steelhead": PHOTOS.wading, "ontario-trout-opener": PHOTOS.creek }[g.slug] || PHOTOS.rainbow;
  fs.writeFileSync(path.join(dir, "index.html"), page({ title: withBrand(g.title), description: g.desc, canonical: `${SITE_URL}/guides/${g.slug}/`, body, schema, stickyCta: "Start free", photo: gph, ogImage: SITE_URL + gph.src }));
  urls.push(`${SITE_URL}/guides/${g.slug}/`);
}
const guidesIndexBody = `
<section class="section"><div class="wrap">
  <h1 style="text-align:left;font-size:30px;">Ontario fishing guides</h1>
  <p style="color:var(--dim);max-width:700px;margin-top:8px;">Where and when to fish for steelhead, salmon and trout across Southern Ontario, then open the app for today's live conditions.</p>
  <div class="rivers-grid" style="margin-top:16px;">${GUIDES.map((g) => `<a class="river-link" href="/guides/${g.slug}/"><b>${esc(g.h1)}</b><span>${esc(g.desc).slice(0, 70)}…</span></a>`).join("")}</div>
  <p style="margin-top:20px;"><a href="/rivers/">Browse all ${RIVERS.length}+ rivers →</a></p>
</div></section>`;
fs.writeFileSync(path.join(OUT, "guides", "index.html"), page({
  title: withBrand("Ontario Fishing Guides: Steelhead, Salmon & Trout"),
  description: "Guides to steelhead, salmon and trout fishing across Southern Ontario, run timing, tactics and the best rivers, with live conditions in the app.",
  canonical: SITE_URL + "/guides/", body: guidesIndexBody,
}));
urls.push(SITE_URL + "/guides/");

// region pages + regions index
fs.mkdirSync(path.join(OUT, "regions"), { recursive: true });
for (const g of REGIONS) {
  const dir = path.join(OUT, "regions", g.slug);
  fs.mkdirSync(dir, { recursive: true });
  const { body, schema } = regionBody(g);
  const rph = g.slug === "grand-river" ? PHOTOS.elora : g.slug === "georgian-bay-lake-huron" ? PHOTOS.creek : g.slug === "toronto-area-rivers" ? PHOTOS.credit : PHOTOS.ganaraska;
  fs.writeFileSync(path.join(dir, "index.html"), page({ title: withBrand(g.title), description: g.desc, canonical: `${SITE_URL}/regions/${g.slug}/`, body, schema, stickyCta: "Start free", photo: rph, ogImage: SITE_URL + rph.src }));
  urls.push(`${SITE_URL}/regions/${g.slug}/`);
}
const regionsIndexBody = `
<section class="section"><div class="wrap">
  <h1 style="text-align:left;font-size:30px;">Fishing regions of Southern Ontario</h1>
  <p style="color:var(--dim);max-width:700px;margin-top:8px;">Explore the rivers by region, Lake Ontario and Lake Huron tributaries, the Grand River watershed and Niagara, then open the app for today's live conditions.</p>
  <div class="rivers-grid" style="margin-top:16px;">${REGIONS.map((g) => `<a class="river-link" href="/regions/${g.slug}/"><b>${esc(g.h1)}</b><span>${esc(g.desc).slice(0, 66)}…</span></a>`).join("")}</div>
  <p style="margin-top:20px;"><a href="/rivers/">Browse all ${RIVERS.length}+ rivers →</a></p>
</div></section>`;
fs.writeFileSync(path.join(OUT, "regions", "index.html"), page({
  title: withBrand("Southern Ontario Fishing Regions: Rivers by Area"),
  description: "Fishing regions of Southern Ontario: Lake Ontario tributaries, Georgian Bay & Lake Huron, the Grand River and Niagara, with live conditions in the app.",
  canonical: SITE_URL + "/regions/", body: regionsIndexBody,
}));
urls.push(SITE_URL + "/regions/");

// ---- trust pages: privacy, terms, contact ----
const UPDATED = "October 2, 2026";
const CONTACT = "info@muddyyorkfishing.ca";
const LEGAL = [
  { slug: "privacy", title: "Privacy policy", desc: "How Muddy York Fishing collects, uses and protects your information, which services we rely on, and your privacy rights under PIPEDA.", body: `
<p class="meta">Last updated ${UPDATED}</p>
<p>Muddy York Fishing ("we", "us") runs the Muddy York Fishing app and the website at muddyyorkfishing.ca. This policy explains what we collect, why, and the choices you have. We follow Canada's Personal Information Protection and Electronic Documents Act (PIPEDA).</p>
<h2>What we collect</h2>
<ul>
<li><b>Account details:</b> your email address, the username you choose, an optional profile picture, and your password (stored only as a secure hash). If you sign in with Google or Apple, we receive your name and email from them.</li>
<li><b>Your fishing activity:</b> rivers you save, notes you write, catches you log, posts, comments and likes, and your alert settings. Logged catches are tied to a river section, never to your exact position.</li>
<li><b>Location:</b> when you tap Scout or Use my location, your phone's location is used to find water near you. It is kept on your device and sent to our servers only to look up nearby rivers, parking and weather. If you drop a pin on a private note, that pin is saved with the note.</li>
<li><b>Membership and payments:</b> Stripe processes all payments. We never see or store your card number; we keep your Stripe customer ID and subscription status.</li>
<li><b>Notifications:</b> if you turn on push notifications, we store your device's push subscription so we can send alerts.</li>
<li><b>Usage:</b> basic, first-party analytics such as which screens are opened and how you found us (for example a search engine or a link). We do not use third-party advertising trackers and we do not sell your information.</li>
</ul>
<h2>How we use it</h2>
<ul>
<li>To run the app: rank rivers, show conditions and regulations, save your rivers and notes, and sync them across your devices.</li>
<li>To send what you ask for: condition alerts for your saved rivers, password resets, membership receipts and replies to support requests. Every non-essential email has an unsubscribe link.</li>
<li>To keep the community safe: moderate reported posts and enforce our <a href="/terms/">terms</a>.</li>
<li>To improve the app, using usage information in aggregate.</li>
</ul>
<h2>Services we rely on</h2>
<p>We share only what each service needs to do its job: Stripe (payments), Resend (email), Cloudinary (photo hosting), Render and Neon (our servers and database), Netlify (the website), Google and Apple (if you choose them to sign in), Open-Meteo (weather for the rivers you view), and OpenStreetMap, Esri and Water Survey of Canada (maps, river and gauge data). Some of these providers store data outside Canada, including in the United States.</p>
<h2>Cookies and storage</h2>
<p>We use one essential cookie to keep you signed in. The app also stores your saved rivers, notes and settings on your device so it works quickly and offline.</p>
<h2>How long we keep it</h2>
<p>We keep your information while your account is open. When you ask us to delete your account, we delete your profile and content. Payment records are kept as long as tax law requires.</p>
<h2>Your choices and rights</h2>
<ul>
<li>See, correct or download the information we hold about you.</li>
<li>Delete your account and its content.</li>
<li>Turn off email or push alerts at any time in your Profile.</li>
<li>Withdraw consent, or make a complaint to the Office of the Privacy Commissioner of Canada.</li>
</ul>
<p>To make a request, email <a href="mailto:${CONTACT}">${CONTACT}</a>.</p>
<h2>Children</h2>
<p>The app is not directed at children under 13, and we do not knowingly collect their information.</p>
<h2>Changes</h2>
<p>If we change this policy in a meaningful way, we will update the date above and tell members in the app or by email.</p>` },
  { slug: "terms", title: "Terms of service", desc: "The terms for using the Muddy York Fishing app and website: membership, the 7-day free trial, billing, cancelling and fishing safely.", body: `
<p class="meta">Last updated ${UPDATED}</p>
<p>These terms apply to the Muddy York Fishing app and the website at muddyyorkfishing.ca. By creating an account or using the app, you agree to them.</p>
<h2>Your account</h2>
<p>You need to be at least 13 to use the app, and the age of majority in your province to buy a membership. Keep your login private; you are responsible for activity on your account. Give us a real email address so we can reach you about your account.</p>
<h2>Membership, trial and billing</h2>
<ul>
<li>A membership is billed monthly or yearly, at the price shown when you sign up, plus any applicable taxes.</li>
<li>New members get a 7-day free trial. You will not be charged if you cancel before the trial ends; otherwise billing starts automatically when it does.</li>
<li>Memberships renew automatically until you cancel. You can cancel anytime from Manage subscription in your Profile. Access continues to the end of the period you have paid for.</li>
<li>Payments are handled by Stripe. If you think you were charged in error, email us and we will make it right.</li>
<li>If we change prices, we will tell you before your next renewal, and you can cancel before it applies.</li>
</ul>
<h2>Fishing information and regulations</h2>
<p>Conditions, scores, strategies and season status are estimates to help you plan. Season and regulation information is drawn from the official Ontario Fishing Regulations Summary and checked regularly, but the Summary is a guide and the legal regulations are made under the Fisheries Act. You are responsible for holding a valid licence and for following all fishing regulations, sanctuary closures and access rules for the water you fish.</p>
<h2>Safety and access</h2>
<p>Rivers are dangerous, especially in high or cold water. Fishing is at your own risk. Parking and access information comes from public map data and may be wrong or out of date. Respect private property and posted signs, and only enter land where you are allowed to be.</p>
<h2>Your content</h2>
<p>You own the posts, photos, notes and comments you create. By posting publicly you allow us to show that content in the app. Do not post anything illegal, abusive, misleading, or that shares someone else's private information or exact private fishing locations without permission. We may remove content or suspend accounts that break these rules.</p>
<h2>Acceptable use</h2>
<p>Do not copy, scrape, resell or reverse-engineer the app or its data, interfere with its operation, or use it for anything unlawful.</p>
<h2>Our liability</h2>
<p>The app is provided as is. To the extent the law allows, we are not liable for indirect or consequential losses, or for injury, fines or loss arising from fishing, travel or relying on information in the app. Our total liability is limited to the amount you paid us in the 12 months before the claim. Nothing in these terms limits rights you have under consumer protection law.</p>
<h2>Changes and ending these terms</h2>
<p>We may update these terms and will tell members about meaningful changes. You can stop using the app and delete your account at any time.</p>
<h2>Governing law</h2>
<p>These terms are governed by the laws of Ontario and the federal laws of Canada that apply there.</p>
<h2>Contact</h2>
<p>Questions about these terms: <a href="mailto:${CONTACT}">${CONTACT}</a>. Read our <a href="/privacy/">privacy policy</a>.</p>` },
  { slug: "contact", title: "Contact us", desc: "Get in touch with Muddy York Fishing for help with the app, your membership or partnerships.", body: `
<p>Muddy York Fishing is an Ontario sport fishing app built in Toronto for trout, steelhead and salmon anglers across Southern Ontario.</p>
<h2>Email</h2>
<p><a href="mailto:${CONTACT}">${CONTACT}</a></p>
<p>We read every message and usually reply within one business day.</p>
<h2>Help with the app</h2>
<p>Members can also send a message from <b>Help and support</b> in the app's menu. It reaches the same inbox and includes your account, so we can help faster.</p>
<h2>Membership and billing</h2>
<p>Change your plan, update your card or cancel anytime from <b>Profile → Manage subscription</b> in the app, or email us.</p>
<h2>Fishing reports, guiding and partnerships</h2>
<p>Run a guide service, fly shop or conservation group, or have a river report to share? We would like to hear from you.</p>` },
];
for (const g of LEGAL) {
  const dir = path.join(OUT, g.slug);
  fs.mkdirSync(dir, { recursive: true });
  const body = `<section class="section"><div class="wrap"><article class="prose">
<div class="crumbs"><a href="${HOME}">Home</a> › ${esc(g.title)}</div>
<h1>${esc(g.title)}</h1>
${g.body}
</article></div></section>`;
  fs.writeFileSync(path.join(dir, "index.html"), page({ title: `${g.title} | ${BRAND}`, description: g.desc, canonical: `${SITE_URL}/${g.slug}/`, body }));
  urls.push(`${SITE_URL}/${g.slug}/`);
}

// photo credits
fs.mkdirSync(path.join(OUT, "photo-credits"), { recursive: true });
fs.writeFileSync(path.join(OUT, "photo-credits", "index.html"), page({
  title: `Photo credits | ${BRAND}`, description: "Credits and licences for the photographs used on the Muddy York Fishing website, all from Wikimedia Commons.",
  canonical: `${SITE_URL}/photo-credits/`,
  body: `<section class="section"><div class="wrap"><article class="prose">
<div class="crumbs"><a href="${HOME}">Home</a> › Photo credits</div>
<h1>Photo credits</h1>
<p>The photographs on this site come from Wikimedia Commons. Thank you to the photographers who share their work.</p>
<ul>${creditRows().map((p) => `<li><a href="${p.fileUrl}" rel="noopener">${esc(p.alt)}</a>, by ${esc(p.credit)}, ${p.licenceUrl ? `<a href="${p.licenceUrl}" rel="noopener">${esc(p.licence)}</a>` : esc(p.licence)}.</li>`).join("")}</ul>
<p>Images marked CC BY-SA were resized and compressed for the web.</p>
</article></div></section>`,
}));
urls.push(`${SITE_URL}/photo-credits/`);

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
