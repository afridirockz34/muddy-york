// Page bodies for the search-focused sections of the public site: river guides,
// salmon run pages and "fishing spots in [town]" pages. Written against
// marketing/client-profile.md (direct, local, honest, no em dashes) and the
// October 2026 research. Regulation facts come only from the official snapshot.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveReach, statusFor } from "../lib/regs-status.js";
import { REACH_REGS, OFFICIAL_SPECIES } from "../lib/regs-reaches.js";
import { SITE_URL, APP_URL, HOME, BRAND, esc } from "../lib/site-shell.js";
import { RIVER_SEO, TOWNS, SALMON_SPOTS } from "./seo-content.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const src = fs.readFileSync(path.join(ROOT, "source-app.jsx"), "utf8");
const C = new Proxy({}, { get: () => "" }); // colours in the app source, unused here
const block = (start, end = "\n};") => { const a = src.indexOf(start) + start.length - 1; return eval("(" + src.slice(a, src.indexOf(end, a) + 2) + ")"); };
export const RIVERS = block("const RIVERS = [", "\n];").map((r) => ({ ...r, section: r.section.replace(/\s*[—–]\s*/g, ": "), note: (r.note || "").replace(/\s*[—–]\s*/g, ", ") }));
const SPECIES = block("const SPECIES = {");
// Official regulations snapshot (the live site reads the twice-daily sync).
// Dash glyphs in the official wording are shown as plain hyphens (same words).
export const SNAP = JSON.parse(fs.readFileSync(path.join(ROOT, "backend", "src", "data", "regs-zones.json"), "utf8").replace(/[—–]/g, "-")).zones;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const plain = (k) => (SPECIES[k] ? SPECIES[k].name.replace(/\s*\((resident)\)/, "") : k);
const listJoin = (a) => (a.length < 2 ? a.join("") : `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}`);
export const riverHref = (r) => `/rivers/${slug(r.river + " " + r.section)}/`;
const km = (a, b, c, d) => { const R = 6371, t = (x) => (x * Math.PI) / 180; const s = Math.sin(t(c - a) / 2) ** 2 + Math.cos(t(a)) * Math.cos(t(c)) * Math.sin(t(d - b) / 2) ** 2; return Math.round(R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s))); };
const townOf = (slugName) => TOWNS.find((t) => t.slug === slugName);
const nearestTowns = (r, n = 2) => TOWNS.map((t) => ({ t, d: km(r.lat, r.lon, t.lat, t.lon) })).sort((a, b) => a.d - b.d).filter((x) => x.d <= 60).slice(0, n);
const salmonFor = (r) => SALMON_SPOTS.find((s) => s.river === r.id);
const runs = (r) => (r.species || []).some((k) => ["CHN", "COH"].includes(k));

// Official seasons per stretch for this river's species, from the snapshot.
function officialStretches(r) {
  const b = resolveReach(r.id, SNAP);
  if (!b) return null;
  const s = statusFor(b, r.species, new Date());
  return { zone: b.zone, stretches: s.stretches };
}

// ── shared bits ──
export const cta = (h, p, label = "Start your free 7-day trial") => `<div class="callout"><h3>${h}</h3><p style="color:var(--dim);margin-bottom:14px;">${p}</p><a class="btn primary" href="${APP_URL}">${label}</a></div>`;
export const faqHtml = (faqs) => faqs.map((f) => `<details><summary>${esc(f.q)}</summary><p>${f.html || esc(f.a)}</p></details>`).join("");
export const faqSchema = (faqs) => ({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) });
const riverCard = (x, note) => `<a class="river-link" href="${riverHref(x)}"><b>${esc(x.river)}</b><span>${esc(note || x.section)}</span></a>`;
// Live "open today?" chip: filled in the browser from the backend's twice-daily
// official sync, so the static page never shows a stale season.
export const liveStatus = (r) => `<div class="live-status" data-reach="${esc(r.id)}" data-sp="${esc((r.species || []).join(","))}">
  <span class="st check">Checking today's season…</span> <span class="ls-note">Official Ontario regulations, checked twice a day</span></div>`;
export const LIVE_STATUS_SCRIPT = `<script>
(function(){document.querySelectorAll(".live-status").forEach(function(el){
  var u="/bk/api/regs/status?id="+encodeURIComponent(el.dataset.reach)+"&sp="+encodeURIComponent(el.dataset.sp||"");
  fetch(u).then(function(r){return r.ok?r.json():null}).then(function(d){ if(!d) throw 0;
    var cls=d.state==="open"?"open":d.state==="closed"?"closed":"check";
    var label=d.state==="open"?"In season today":d.state==="closed"?"Closed today":d.state==="varies"?"Varies by stretch today":d.state==="some"?"Some species open today":"Check regs today";
    var st=el.querySelector(".st"); st.className="st "+cls; st.textContent=label;
    if(d.stretches&&d.stretches.length>1){ el.querySelector(".ls-note").textContent=d.stretches.map(function(s){return s.label+": "+s.stateLabel}).join(" · "); }
  }).catch(function(){ var st=el.querySelector(".st"); if(st&&/Checking/.test(st.textContent)) st.textContent="Today's status is in the app"; });
});})();
</script>`;

// Weekly run status for a salmon spot, filled in the browser from the run
// tracker (an admin note plus members' sightings). The static text is what
// shows if the tracker can't be reached.
export const runStatus = (s) => `<div class="run-status" data-spot="${esc(s.slug)}">
  <b>Run status this week</b> <span class="rs-text">Updated weekly from August to November by ${BRAND} and member sightings.</span>
  <a class="rs-cta" href="${APP_URL}">Members see daily sightings</a></div>`;
export const RUN_STATUS_SCRIPT = `<script>
(function(){var L={none:"No fish seen",staging:"Fish staging at the mouth",moving:"Fish moving upstream",stacked:"Fish stacked below barriers",spawning:"Fish spawning",spent:"Run winding down"};
document.querySelectorAll(".run-status").forEach(function(el){
  fetch("/bk/api/run-status?spot="+encodeURIComponent(el.dataset.spot)).then(function(r){return r.ok?r.json():null}).then(function(d){ if(!d) return;
    var t=el.querySelector(".rs-text"), bits=[];
    if(d.note) bits.push(d.note);
    if(d.state) bits.push(L[d.state]+(d.reports7?" ("+d.reports7+" member sighting"+(d.reports7>1?"s":"")+" this week)":""));
    var when=d.noteUpdatedAt||d.lastReportAt; if(when) bits.push("Updated "+new Date(when).toLocaleDateString("en-CA",{month:"short",day:"numeric"}));
    if(bits.length) t.textContent=bits.join(". ")+".";
  }).catch(function(){});
});})();
</script>`;

// ── river guide ──
export function riverPage(r) {
  const seo = RIVER_SEO[r.id] || { title: `${r.river} Fishing`, towns: [], access: [], hook: "" };
  const spKeys = (r.species || []).filter((k) => SPECIES[k]);
  const spNames = [...new Set(spKeys.map(plain))];
  const towns = seo.towns || [];
  const where = towns.length ? ` in ${listJoin(towns.slice(0, 2))}` : "";
  const official = officialStretches(r);
  const zone = official ? official.zone : null;
  const salmon = salmonFor(r);
  const nearT = nearestTowns(r);
  const region = r.region;
  const nearby = RIVERS.filter((x) => x !== r).map((x) => ({ x, d: km(r.lat, r.lon, x.lat, x.lon) })).sort((a, b) => a.d - b.d).slice(0, 4);

  // Best months, from the app's species activity model (biology, not law).
  const monthRow = (k) => `<tr><td>${esc(plain(k))}</td>${SPECIES[k].a.map((v, i) => `<td class="m${v >= 0.8 ? 3 : v >= 0.5 ? 2 : v >= 0.2 ? 1 : 0}" title="${MONTHS[i]}">${v >= 0.8 ? "●" : v >= 0.5 ? "◐" : v >= 0.2 ? "○" : ""}</td>`).join("")}</tr>`;
  const peakMonths = (k) => SPECIES[k].a.map((v, i) => (v >= 0.8 ? MONTHS[i] : null)).filter(Boolean);
  const peaks = spKeys.map((k) => ({ name: plain(k), m: peakMonths(k) })).filter((x) => x.m.length);

  const stretchHtml = official ? official.stretches.map((st) => {
    const sp = [...new Map(st.species.map((x) => [x.official, x])).values()];
    return `<h3>${esc(st.label)}</h3>
${st.note ? `<p>${esc(st.note)}</p>` : ""}${st.review ? `<p>The summary doesn't list this stretch by name, so confirm it in the <a href="/regulations/zone-${zone}/">Zone ${zone} regulations</a> before fishing.</p>` : ""}
<ul>${sp.map((x) => `<li><b>${esc(x.official)}:</b> ${esc(x.season || "see the zone page")}${x.closures.length ? `. Sanctuary: ${esc(x.closures.map((c) => c.text.replace(/^Fish sanctuary\s*-\s*/i, "")).join("; "))}` : ""}${x.limits ? ` <span class="src">(limits ${esc(x.limits)})</span>` : ""}</li>`).join("")}</ul>
${st.entries.length ? `<p class="src">Official wording: ${st.entries.map((e) => `<a href="${esc(e.link)}" rel="nofollow">${esc(e.text.length > 90 ? e.text.slice(0, 88) + "…" : e.text)}</a>`).join(" · ")}</p>` : ""}`;
  }).join("") : `<p>See the official Ontario Fishing Regulations Summary for this water.</p>`;

  const firstStretch = official && official.stretches[0];
  const seasonLine = firstStretch ? firstStretch.species.map((x) => `${x.official} ${x.season}`).filter((v, i, a) => a.indexOf(v) === i).slice(0, 2).join("; ") : "";

  const faqs = [
    { q: `What fish are in the ${r.river}?`, a: `The ${r.river} (${r.section}) holds ${listJoin(spNames)}.${peaks.length ? ` Activity peaks for ${listJoin(peaks.slice(0, 2).map((p) => `${p.name.toLowerCase()} in ${listJoin(p.m)}`))}.` : ""}` },
    { q: `Is the ${r.river} good for fishing?`, a: `${seo.hook} Like most Southern Ontario rivers it fishes best on the right day: ${runs(r) || spKeys.includes("STL") ? "fresh rain pulls new fish in from the lake, and the drop and clear afterwards is prime" : "steady, cool water and low light are prime, while warm summer afternoons are poor"}.` },
    { q: `Can I fish the ${r.river} right now?`, a: `${official && official.stretches.length > 1 ? `It depends on the stretch: ${official.stretches.map((s) => s.label).join(", ")} each have their own official rules, listed on this page.` : `Check the official season on this page${seasonLine ? `: ${seasonLine}` : ""}.`} The status at the top of the page is checked against the Ontario summary twice a day.` },
    runs(r)
      ? { q: `When is the salmon run on the ${r.river}?`, a: `Chinook salmon usually enter the ${r.river} from late August, peak in September and finish in October${spKeys.includes("COH") ? ", with coho a little later into October and November" : ""}. Each fresh rain brings a new push of fish.` }
      : { q: `When is the best time to fish the ${r.river}?`, a: peaks.length ? `Peak months are ${listJoin(peaks.map((p) => `${listJoin(p.m)} for ${p.name.toLowerCase()}`))}. Within those months, cool cloudy days and the first and last light are best.` : "Spring and fall, in cool water and low light." },
    { q: `What is the ${r.river} water level today?`, a: !GAUGES[r.id] ? `There's no federal flow gauge on this stretch, so ${BRAND} estimates its conditions each morning from live weather and recent rain.` : `The live reading on this page comes from a Water Survey of Canada gauge on the ${r.river}. A rising level brings fresh fish in; the drop and clear a day or two later usually fishes best.` },
    { q: `What is the water temperature of the ${r.river}?`, a: `It changes daily. ${BRAND} estimates it each morning from live air temperature, weather and flow. Trout feed best at about 10 to 18°C and struggle above 20°C.` },
    { q: `Where can I fish the ${r.river}?`, a: `Public places along this section include ${listJoin(seo.access && seo.access.length ? seo.access : towns)}. Only fish where access is public or permitted, respect posted private land, and check the stretch rules above.` },
    { q: "Do I need a fishing licence?", a: `Yes, most anglers need an Outdoors Card and a valid Ontario fishing licence.${zone ? ` This river is in Fisheries Management Zone ${zone}.` : ""}` },
  ];

  const body = `
<div class="wrap"><div class="crumbs"><a href="${HOME}">Home</a> › <a href="/rivers/">Rivers</a> › ${hubFor(r) ? `<a href="${mainHref(r)}">${esc(r.river)}</a> › ${esc(r.section.split(":")[0])}` : esc(r.river)}</div></div>
<section class="section" style="padding-top:14px;"><div class="wrap"><article class="prose">
  <h1>${esc(r.river)} fishing${esc(where)}</h1>
  <div class="meta">${esc(r.section)} · ${esc(region)}${zone ? ` · <a href="/regulations/zone-${zone}/">FMZ ${zone}</a>` : ""}</div>
  ${liveStatus(r)}
  ${salmon ? `<p class="run-link">Coming for the salmon run? <a href="/salmon-run/${salmon.slug}/">${esc(salmon.title.replace("{Y}", seasonYear()))}</a>, with this week's run status.</p>` : ""}
  <p><b>${esc(seo.hook)}</b></p>
  <p>${esc(r.note)}</p>
  <div class="cta-row"><a class="btn primary" href="${APP_URL}">See today's ${esc(r.river)} conditions</a><span>7 days free, then $5.00/mo yearly</span></div>
  ${hubFor(r) ? `<p>This is one of ${hubFor(r).sections.length} ${esc(r.river)} sections we cover. <a href="${mainHref(r)}">All ${esc(r.river)} fishing spots, water level and conditions →</a></p>` : ""}

  <h2>${esc(r.river)} water level and flow today</h2>
  ${gaugeBox(r)}

  <h2>What fish are in the ${esc(r.river)}?</h2>
  <p>This section holds ${esc(listJoin(spNames))}. The table shows when each is most active through the year, from ${BRAND}'s species model. It shows the fish, not the law, so check the open season below too.</p>
  <div class="tbl-wrap"><table class="months"><thead><tr><th></th>${MONTHS.map((m) => `<th>${m[0]}</th>`).join("")}</tr></thead><tbody>${spKeys.map(monthRow).join("")}</tbody></table></div>
  <p class="src">● peak · ◐ good · ○ fair</p>

  <h2>Can I fish the ${esc(r.river)} right now?</h2>
  <p>Ontario sets the season by stretch. Here are the official rules for this section${zone ? ` (Fisheries Management Zone ${zone})` : ""}, from the Ontario Fishing Regulations Summary:</p>
  ${stretchHtml}
  ${zone ? `<p><a href="/regulations/zone-${zone}/">All Zone ${zone} fishing regulations →</a></p>` : ""}

  ${cta(`Know before you drive to the ${esc(r.river)}`, `Every morning ${BRAND} scores the ${esc(r.river)} from live water temperature, flow and weather, shows whether your stretch is open, and tells you the fly and technique to use.`, "Try it free for 7 days")}

  <h2>How the ${esc(r.river)} fishes</h2>
  <p>${esc(howItFishes(r))}</p>
  <h3>Tactics by species</h3>
  <ul>${spKeys.filter((k) => TACTICS[k]).map((k) => `<li><b>${esc(plain(k))}:</b> ${esc(TACTICS[k])}</li>`).join("")}</ul>
  ${salmon ? `<p>Coming for the fall run? See our <a href="/salmon-run/${salmon.slug}/">${esc(salmon.h1)}</a> guide for where to watch and what's legal.</p>` : ""}

  <h2>The ${esc(r.river)} through the year</h2>
  ${seasonsHtml(r, spKeys, official)}

  <h2>Fly fishing the ${esc(r.river)}: flies and lures</h2>
  <ul>${spKeys.filter((k) => FLIES[k]).map((k) => `<li><b>${esc(plain(k))}:</b> on the fly rod, ${esc(FLIES[k].fly)}. On spinning gear, ${esc(FLIES[k].spin)}.</li>`).join("")}</ul>
  <p>Gear and bait rules can differ by stretch, so match what you tie on to the rules for your water above. ${BRAND} picks the technique and fly for the day from live water temperature and clarity.</p>

  <h2>${esc(r.river)} water temperature</h2>
  ${waterTempHtml(r.river)}

  <h2>Reading the water</h2>
  <p>${esc(readWaterHtml(r))}</p>
  <p>Before a trip, check the river's flow on the <a href="https://wateroffice.ec.gc.ca" rel="noopener">Water Survey of Canada</a> real-time gauges${authorityOf(r.id) ? ` and any flood or safety messages from the <a href="${authorityOf(r.id).url}" rel="noopener">${esc(authorityOf(r.id).name)}</a>, which manages the ${esc(r.river)} watershed and publishes maps of its conservation areas and trails` : ""}.</p>

  <h2>${esc(r.river)} fishing spots</h2>
  <p>Public places along this section include ${esc(listJoin(seo.access && seo.access.length ? seo.access : towns))}. Park in public lots, follow posted signs, and never cross private land without permission. ${BRAND} members get parking and walk-in routes for each section, and exact spots are never shared publicly.</p>

  <h2>Before you go</h2>
  <ul>
    <li>Carry your Outdoors Card and fishing licence.</li>
    <li>Check which stretch you'll fish and its official season above. Rules often change at a bridge or road.</li>
    <li>Look at the water temperature. Above about 20°C, trout and salmon struggle, so fish early or rest them.</li>
    <li>After heavy rain the ${esc(r.river)} can be high and dangerous. Never wade water you can't read, and wear a wading belt.</li>
    <li>Pack out everything you bring, including line and bait containers.</li>
  </ul>

  <h2>Frequently asked</h2>
  ${faqHtml(faqs)}

  <h2>Nearby rivers</h2>
  <div class="rivers-grid">${nearby.map(({ x, d }) => riverCard(x, `${x.section} · ${d} km`)).join("")}</div>
  <p style="margin-top:14px;">${nearT.map(({ t }) => `<a href="/fishing-spots/${t.slug}/">Fishing spots in ${esc(t.name)} →</a>`).join(" · ")}${nearT.length ? " · " : ""}<a href="/rivers/">All ${RIVERS.length} river guides →</a></p>

  ${cta(`Fish the ${esc(r.river)} on the right day`, `Live conditions, the official season for your stretch and today's fly, for 30+ rivers and hundreds of spots Ontario-wide.`)}
</article></div></section>`;
  const desc = clampDesc(`${seo.hook} See today's conditions free for 7 days.`, `${seo.hook}`);
  return {
    title: seo.title, description: desc, body, stickyCta: "See today's conditions",
    schema: [
      { "@context": "https://schema.org", "@type": "Article", headline: `${r.river} fishing${where}`, description: desc, about: spNames,
        mainEntityOfPage: `${SITE_URL}${riverHref(r)}`, publisher: { "@type": "Organization", name: BRAND, url: SITE_URL } },
      faqSchema(faqs),
    ],
  };
}

// Conservation authority for each river's watershed: the local source for
// flow warnings, trail and parking maps, and stream restoration work.
const AUTHORITY = {
  grandriver: { name: "Grand River Conservation Authority", url: "https://www.grandriver.ca", ids: ["grand-tw", "grand-lower", "conestogo-tw"] },
  cvc: { name: "Credit Valley Conservation", url: "https://cvc.ca", ids: ["credit-lower", "credit-upper", "credit-mid"] },
  grca: { name: "Ganaraska Region Conservation Authority", url: "https://grca.on.ca", ids: ["ganaraska", "wilmot"] },
  nvca: { name: "Nottawasaga Valley Conservation Authority", url: "https://www.nvca.on.ca", ids: ["notty-main", "notty-tribs", "boyne"] },
  gsca: { name: "Grey Sauble Conservation", url: "https://www.greysauble.on.ca", ids: ["beaver-lower", "beaver-upper", "bighead", "sydenham-os", "sauble"] },
  npca: { name: "Niagara Peninsula Conservation Authority", url: "https://npca.ca", ids: ["twelve-mile", "niagara-lower"] },
  halton: { name: "Conservation Halton", url: "https://www.conservationhalton.ca", ids: ["bronte", "sixteen"] },
  trca: { name: "Toronto and Region Conservation Authority", url: "https://trca.ca", ids: ["duffins", "humber-lower", "rouge-lower"] },
  cloca: { name: "Central Lake Ontario Conservation", url: "https://www.cloca.com", ids: ["bowmanville"] },
  saugeen: { name: "Saugeen Conservation", url: "https://www.saugeenconservation.ca", ids: ["saugeen-denny"] },
  mvca: { name: "Maitland Valley Conservation Authority", url: "https://www.mvca.on.ca", ids: ["maitland-lower"] },
};
const authorityOf = (id) => Object.values(AUTHORITY).find((a) => a.ids.includes(id)) || null;

// Common, proven Ontario patterns per species. Gear, not law: bait and hook
// rules vary by stretch, so the page sends readers to the regulations above.
const FLIES = {
  STL: { fly: "egg patterns (Nuke Eggs, Sucker Spawn), stonefly and Pheasant Tail nymphs, and Woolly Buggers or Intruder style streamers", spin: "roe bags or soft beads under a float, plus small spinners and spoons in stained water" },
  CHN: { fly: "large, bright streamers and egg patterns swung slowly through holding pools", spin: "spoons, plugs and rattle baits, which trigger strikes from territorial fish" },
  COH: { fly: "small, bright streamers stripped briskly and egg patterns", spin: "inline spinners and small spoons" },
  BNTr: { fly: "egg patterns and sculpin or minnow streamers", spin: "small spinners and minnow plugs, or baits under a float" },
  BNT: { fly: "Pheasant Tail and Hare's Ear nymphs, Elk Hair Caddis and mayfly dries, and sculpin or Woolly Bugger streamers at dawn and dusk", spin: "small inline spinners and minnow imitating plugs cast tight to cover" },
  RBT: { fly: "Pheasant Tail and Hare's Ear nymphs, Elk Hair Caddis and Adams dries", spin: "small inline spinners and spoons" },
  BKT: { fly: "small Adams and Elk Hair Caddis dries, beadhead nymphs and tiny streamers", spin: "the smallest inline spinners, with the barbs pinched" },
  ATS: { fly: "small wet flies and nymphs on light tippet (release every Atlantic salmon)", spin: "small spinners with a single barbless hook (release every Atlantic salmon)" },
  LAT: { fly: "deep, slow streamers", spin: "jigs and spoons worked near bottom" },
};

// The river through the year, built from its species, its water type and the
// official seasons on its stretches.
function seasonsHtml(r, spKeys, official) {
  const migratory = spKeys.some((k) => ["STL", "CHN", "COH", "BNTr", "ATS"].includes(k));
  const resident = spKeys.some((k) => ["BNT", "RBT", "BKT"].includes(k));
  const w = (r.water || "").toLowerCase();
  const tail = w.includes("tailwater") || w.includes("tailrace");
  const cold = /spring|headwater|cold/.test(w);
  const allYear = !!official && official.stretches.some((st) => st.species.some((x) => /all year/i.test(x.season || "")));
  const p = [];
  p.push(`<h3>Spring</h3><p>${migratory && spKeys.includes("STL")
    ? `Spring is steelhead season on the ${esc(r.river)}. Fish that came in over the winter spawn from March into April, then drop back to the lake. Rain and snowmelt keep the water high and cold, so fish slow and deep in the softer edges.`
    : `Snowmelt and spring rain run the ${esc(r.river)} high and cold. Trout feed hard once the water starts to warm, and nymphs and streamers fished slow and deep take most fish.`}${resident ? ` In most of Zones 16 and 17 the trout season opens on the fourth Saturday in April; check the stretch rules above.` : ""}</p>`);
  p.push(`<h3>Summer</h3><p>${tail
    ? `Cold water released from the dam keeps the ${esc(r.river)} fishable when other rivers warm up. Expect hatches in the evenings, and fish dries and dry-droppers over the riffles and pool tails.`
    : cold
      ? `Groundwater keeps this water cool through July and August. Trout spread into the riffles to feed, so light tippet, small dries and nymphs, and a quiet approach are the keys.`
      : migratory
        ? `Summer is the quiet season on lower ${esc(r.river)}. The water warms and most migratory fish are in the lake. Fish early in the morning if you go, and stop when the water passes about 20°C.`
        : `Warm afternoons are poor. Fish the first and last light, look for shade and spring seeps, and stop when the water passes about 20°C.`}</p>`);
  p.push(`<h3>Fall</h3><p>${spKeys.includes("CHN")
    ? `The Chinook salmon run fills the ${esc(r.river)} from late August, peaks from mid September to mid October, and fades through October. Steelhead${spKeys.includes("BNTr") ? " and lake run brown trout" : ""} follow the salmon in to feed on loose eggs, and fresh rain brings each new wave of fish.`
    : spKeys.includes("STL")
      ? `Steelhead start to move up from the lake with the first cold rains of October, and fishing improves through November.`
      : `Cooling water brings trout back into the open, and brown and brook trout get aggressive before they spawn. Most zone-wide trout seasons close on September 30, so check the stretch rules.`}</p>`);
  p.push(`<h3>Winter</h3><p>${allYear && spKeys.includes("STL")
    ? `Part of the ${esc(r.river)} is open all year, and steelhead hold in the slow, deep pools through winter. Mild days after a thaw are best. Fish slow and small, and watch for shelf ice on the banks.`
    : allYear
      ? `Part of the ${esc(r.river)} is open all year. Fish are slow in cold water, so pick mild afternoons and fish deep pools.`
      : `Most of this water is closed or frozen in winter. Use the time to plan spring trips and check the new regulations summary when it comes out.`}</p>`);
  return p.join("\n");
}

function readWaterHtml(r) {
  const w = (r.water || "").toLowerCase();
  if (w.includes("tailwater") || w.includes("tailrace")) return `On a tailwater, the release from the dam sets the day. Steady releases keep fish in their usual lies: the seams beside fast water, the heads of pools and the tails just before a riffle. A big change in release can turn the fish off for a few hours, so check the flow before you go.`;
  if (/spring|headwater|cold|brook/.test(w)) return `In small, cold water, trout live under cover: undercut banks, fallen trees, root wads and the plunge pools below small drops. Walk upstream, stay back from the bank, and make the first cast to each spot count.`;
  return `Migratory fish rest in the deepest, slowest water they can find and move through the shallow riffles quickly. Look for pools below riffles, tailouts, log jams and the seam where fast water meets slow. After rain, fish move; as the water drops and clears, they settle into those lies and bite best.`;
}

// Go-to approach for each species, in the profile's voice.
const TACTICS = {
  STL: "drift eggs, stoneflies and nymphs through runs and tailouts under a float or on a tight line, and swing streamers when the water is stained.",
  CHN: "fish deep holding pools and log-jam tailouts in the lower river with bright streamers swung slowly, or drift roe and egg patterns. Use stout tackle.",
  COH: "strip bright streamers and drift egg patterns through lower-river pools and current breaks. Coho chase more than Chinook.",
  BNTr: "fish streamers, eggs and nymphs on dropping, clearing water, especially at first and last light.",
  BNT: "nymph the seams in cool water, run a dry-dropper in prime temperatures, and swing or strip streamers at dawn and dusk for bigger fish.",
  RBT: "nymph the seams and riffle tails, and run a dry-dropper over the riffles when fish are rising.",
  BKT: "fish small dries, nymphs and tiny streamers on light tippet, and keep low and quiet in small water.",
  ATS: "Atlantic salmon are catch-and-release only. Use small wets and nymphs on light tippet in low light, and release them quickly.",
  LAT: "work deep, slow streamers and jigs off the main current in the cold months.",
};
function howItFishes(r) {
  const w = (r.water || "").toLowerCase();
  if (w.includes("tailwater")) return `Below the dam, flows and water temperature stay steadier than on a freestone river. The ${r.river} often fishes when nearby rivers are blown out or too warm, and cold releases can hold trout through summer. Nymphs work most of the year; dries and streamers come into play in prime temperatures and low light.`;
  if (/spring|headwater|cold/.test(w)) return `These cold, spring-fed headwaters run clear and cool. Trout hold in shade, undercut banks and pocket water. Approach quietly, use light tippet, and fish small dries, dry-droppers and nymphs.`;
  if (/lower|mouth|tributar/.test(w) || runs(r) || (r.species || []).includes("STL")) return `This is migratory water. Steelhead and salmon move up from the lake on fresh rain, so the best fishing usually comes as the river drops and clears a day or two after a rise. Fish hold in deep pools, tailouts and current seams. Drift eggs and nymphs, or swing and strip streamers, depending on clarity.`;
  return `This reach rises and clears with rainfall, so timing matters: it fishes best on dropping, clearing water a day or two after a rise.`;
}

export function clampDesc(full, short) {
  if (full.length <= 158) return full;
  if ((short + " Try it free.").length <= 158) return short + " Try it free.";
  return short.slice(0, 155).replace(/\s+\S*$/, "") + "…";
}

// ── salmon run hub and spot pages ──
export function seasonYear(d = new Date()) { return d.getMonth() >= 10 ? d.getFullYear() + 1 : d.getFullYear(); }

export function salmonHub() {
  const Y = seasonYear();
  const faqs = [
    { q: "When is the salmon run in Ontario?", a: "Chinook salmon start entering Lake Ontario, Lake Huron and Georgian Bay tributaries in late August, peak through September and finish in October. Coho run a little later, into October and November. Exact timing shifts each year with rain and water temperature." },
    { q: "Are the salmon running right now?", a: `In September and early October, almost certainly in the rivers listed on this page; by November the Chinook run is over. A cool, rainy week brings the biggest pushes. ${BRAND} tracks each river's conditions daily.` },
    { q: "Where is the best place to see the salmon run near Toronto?", a: "The Humber River at Old Mill in Toronto, the Credit River in Mississauga, the fish ladders in Port Hope and Bowmanville, and Duffins Creek in Ajax are all within an hour of downtown." },
    { q: "What time of day is best to see the salmon run?", a: "Early morning and evening, and on overcast days after rain, when fish are most active and moving. Midday in bright sun is usually slowest." },
    { q: "Why can't you eat salmon after spawning?", a: "Chinook and coho die after spawning, and their bodies break down as they near the end of the run, so fish deep into the run are poor to eat. Many anglers release coloured fish." },
    { q: "Can you fish for salmon during the run?", a: "In many places, yes, but rules change by stretch. Some sections near fish ladders are sanctuaries during the run. Each spot page below lists the official rules." },
  ];
  const body = `
<div class="wrap"><div class="crumbs"><a href="${HOME}">Home</a> › Salmon run</div></div>
<section class="section" style="padding-top:14px;"><div class="wrap"><article class="prose">
  <h1>Ontario salmon run ${Y}: where and when to see it</h1>
  <p><b>Every fall, Chinook salmon swim out of the Great Lakes and up Southern Ontario's rivers to spawn, leaping fish ladders and weirs on the way.</b> The run starts in late August, peaks in September and is over by early November.</p>
  <p>Below are the best-known places to watch near Toronto and around Lake Ontario and Georgian Bay, with what's legal to fish at each, straight from the official Ontario regulations.</p>
  <div class="cta-row"><a class="btn primary" href="${APP_URL}">See which rivers are running</a><span>7 days free</span></div>

  <h2>When is the salmon run in Ontario?</h2>
  <p>Chinook (king) salmon are the main event. They begin staging off river mouths in August, push upstream on the first cool rains of late August and September, and spawn through early October. Coho follow into October and November. Lake-run steelhead and brown trout often follow the salmon in, feeding on eggs.</p>
  <p>The run comes in waves. A heavy rain raises and colours the rivers and pulls a fresh push of fish; a warm, dry spell stalls it. The day or two after rain is usually the best time to see fish moving.</p>

  <h2>Where to see the salmon run</h2>
  ${SALMON_SPOTS.map((s) => { const r = RIVERS.find((x) => x.id === s.river); return `<h3><a href="/salmon-run/${s.slug}/">${esc(s.h1)}</a></h3>${runStatus(s)}<p>${esc(s.watch)}</p>${r ? `<p class="src">River guide: <a href="${riverHref(r)}">${esc(r.river)} fishing</a></p>` : ""}`; }).join("")}

  ${cta("Catch the run on the right day", `${BRAND} reads live river conditions every morning, so you know which rivers just got rain and where fish are likely moving.`)}

  <h2>Watching the run responsibly</h2>
  <ul>
    <li>Watch from the bank and stay off the gravel beds where salmon are spawning.</li>
    <li>Don't touch, chase or throw things at the fish.</li>
    <li>Keep dogs leashed and away from the water's edge.</li>
    <li>Fish only where it's open. Several popular viewing spots are sanctuaries during the run.</li>
  </ul>

  <h2>Frequently asked</h2>
  ${faqHtml(faqs)}
  <p style="margin-top:18px;"><a href="/guides/salmon-run-ontario/">How to fish the salmon run →</a> · <a href="/regulations/">Ontario fishing regulations by zone →</a> · <a href="/fishing-spots/toronto/">Fishing spots in Toronto →</a></p>
</article></div></section>`;
  return {
    title: `Salmon Run Ontario ${Y}: Where & When to See It`, description: `When the Ontario salmon run peaks, the best places to watch near Toronto, Port Hope and Bowmanville, and where it's legal to fish. Updated for ${Y}.`,
    body, stickyCta: "See which rivers are running", schema: [faqSchema(faqs)],
  };
}

export function salmonSpotPage(s) {
  const Y = seasonYear();
  const r = RIVERS.find((x) => x.id === s.river);
  const town = townOf(s.town);
  const others = SALMON_SPOTS.filter((x) => x !== s);
  const faqs = [
    { q: `When is the salmon run in ${s.place}?`, a: `Chinook salmon usually arrive in late August, peak in September and finish by mid October. The biggest pushes follow cool, rainy weather.` },
    { q: `Where can I see the salmon run in ${s.place}?`, a: s.watch },
    { q: `Can I fish for salmon here?`, a: s.rules },
    { q: "What time of day is best to see salmon jumping?", a: "Early morning, evening and overcast days after rain are best. Fish move less in bright midday sun." },
  ];
  const body = `
<div class="wrap"><div class="crumbs"><a href="${HOME}">Home</a> › <a href="/salmon-run/">Salmon run</a> › ${esc(s.place)}</div></div>
<section class="section" style="padding-top:14px;"><div class="wrap"><article class="prose">
  <h1>${esc(s.h1)} ${Y}</h1>
  ${runStatus(s)}
  ${r ? liveStatus(r) : ""}
  <p><b>${esc(s.watch)}</b></p>
  <p>Chinook salmon start running in late August, peak through September and are mostly done by mid October. The day or two after a good rain is usually the best time to see fish moving.</p>
  <div class="cta-row"><a class="btn primary" href="${APP_URL}">Check today's river conditions</a><span>7 days free</span></div>

  <h2>Where to watch the salmon run in ${esc(s.place)}</h2>
  <p>${esc(s.watch)} Stay on public paths, watch from the bank, and keep off the spawning gravel.</p>

  <h2>What you'll see</h2>
  <p>Most of the big fish are Chinook salmon: heavy, dark fish that turn bronze and develop a hooked jaw as they near spawning. Coho are smaller and often brighter, and silver steelhead and brown trout follow the salmon in to feed on eggs. Fish rest in the deeper pools between pushes, then charge the falls and fish ladders in bursts.</p>
  <h3>Tips for a good visit</h3>
  <ul>
    <li>Go the morning after a good rain, when fresh fish are moving.</li>
    <li>Overcast days are better than bright sun for seeing fish jump.</li>
    <li>Polarized sunglasses help you see fish holding in the pools.</li>
    <li>Weekdays are quieter than weekends at the popular spots.</li>
  </ul>

  <h2>The run, week by week</h2>
  <ul>
    <li><b>August:</b> Chinook gather off the mouth of the ${esc(r ? r.river : "river")} and in the harbour. Very few fish are in the river yet.</li>
    <li><b>Early to mid September:</b> the first good rain pulls the first fish upstream. They move mostly at night and early in the morning.</li>
    <li><b>Mid September to mid October:</b> the peak. Fish stack below barriers and run the ladders in waves, often a day or two after rain.</li>
    <li><b>Late October:</b> most salmon have spawned and died. Spawned out fish with pale, frayed fins and carcasses on the gravel are a normal end to the run.</li>
    <li><b>November:</b> steelhead and lake run brown trout move in behind the salmon to feed on loose eggs.</li>
  </ul>
  <p>Every year is different. A dry September can hold fish in the lake for weeks, then one heavy rain brings them all in at once.</p>

  <h2>Watching responsibly</h2>
  <ul>
    <li>Stay behind railings at fish ladders and dams, where banks are steep and slippery.</li>
    <li>Keep dogs leashed and back from the water.</li>
    <li>Do not throw anything at the fish or try to touch them. They are exhausted.</li>
    <li>Leave the gravel alone. The pale, cleaned patches are spawning beds (redds) with eggs in them.</li>
    <li>Park only in marked lots and respect neighbours on residential streets.</li>
  </ul>

  <h2>Can you fish for salmon here?</h2>
  <p>${esc(s.rules)}</p>
  <p>Where fishing is allowed, snagging is not. Ontario's rules say a fish hooked anywhere other than the mouth must be released right away. Atlantic salmon, which are being restored to Lake Ontario, must be released in these rivers.</p>
  <p class="src">From the official Ontario Fishing Regulations Summary. ${r ? `Full stretch-by-stretch rules are on the <a href="${riverHref(r)}">${esc(r.river)} fishing guide</a>.` : ""}</p>

  ${cta(`Plan your trip to ${esc(s.place)}`, `${BRAND} shows live conditions on the ${esc(r ? r.river : "river")} every morning, whether your stretch is open, and what to fish if you're casting.`)}

  <h2>Frequently asked</h2>
  ${faqHtml(faqs)}

  <h2>More places to see the run</h2>
  <ul>${others.map((o) => `<li><a href="/salmon-run/${o.slug}/">${esc(o.h1)}</a></li>`).join("")}</ul>
  <p><a href="/salmon-run/">Ontario salmon run guide →</a>${town ? ` · <a href="/fishing-spots/${town.slug}/">Fishing spots in ${esc(town.name)} →</a>` : ""}${r ? ` · <a href="/regulations/zone-${REACH_REGS[r.id].zone}/">Zone ${REACH_REGS[r.id].zone} regulations →</a>` : ""}</p>
</article></div></section>`;
  return {
    title: s.title.replace("{Y}", Y),
    description: clampDesc(`Is the ${s.place.split(",")[0]} salmon run on? This week's run status, when it peaks in ${Y}, where to watch and where it's legal to fish.`, `${s.place} salmon run ${Y}: this week's status, where to watch and where it's legal to fish.`),
    body, stickyCta: "Check today's conditions", schema: [faqSchema(faqs)],
  };
}

// ── "fishing spots in [town]" ──
// A season-by-season summary across the rivers near a town.
function townSeasons(rivers) {
  const has = (k) => rivers.some((r) => (r.species || []).includes(k));
  const names = (k) => listJoin([...new Set(rivers.filter((r) => (r.species || []).includes(k)).map((r) => r.river))].slice(0, 3));
  const out = [];
  if (has("STL")) out.push(`<p><b>Spring (March to May):</b> spring steelhead in the lower ${names("STL")}. Trout season opens on most inland stretches on the fourth Saturday in April.</p>`);
  else out.push(`<p><b>Spring (late April to May):</b> trout season opens on most stretches on the fourth Saturday in April, with high, cold water and hungry fish.</p>`);
  if (has("BNT") || has("BKT") || has("RBT")) out.push(`<p><b>Summer (June to August):</b> the cold water on the ${names(has("BNT") ? "BNT" : has("BKT") ? "BKT" : "RBT")} holds trout through the heat. Fish early and late, and stop when the water passes about 20°C.</p>`);
  else out.push(`<p><b>Summer (June to August):</b> lower rivers run warm and quiet. Most trout and salmon are out in the lake.</p>`);
  if (has("CHN")) out.push(`<p><b>Fall (September to November):</b> the Chinook salmon run on the ${names("CHN")} peaks from mid September to mid October, with steelhead following into November.</p>`);
  else out.push(`<p><b>Fall (September to November):</b> cooling water wakes the trout up. Many zone-wide trout seasons close on September 30, so check each stretch.</p>`);
  out.push(`<p><b>Winter (December to February):</b> ${has("STL") ? `the stretches that are open all year hold steelhead in the slow, deep pools. Mild days after a thaw are best.` : `most local trout water is closed or frozen. Check the zone page for anything open all year.`}</p>`);
  return out.join("\n");
}
export function townPage(t) {
  const near = RIVERS.map((r) => ({ r, d: km(t.lat, t.lon, r.lat, r.lon) })).sort((a, b) => a.d - b.d).filter((x) => x.d <= 70).slice(0, 8);
  const list = near.length >= 3 ? near : RIVERS.map((r) => ({ r, d: km(t.lat, t.lon, r.lat, r.lon) })).sort((a, b) => a.d - b.d).slice(0, 5);
  const salmonHere = SALMON_SPOTS.filter((s) => list.some((x) => x.r.id === s.river));
  const species = [...new Set(list.flatMap((x) => (x.r.species || []).filter((k) => SPECIES[k]).map(plain)))];
  const faqs = [
    { q: `Where can I go fishing in ${t.name}?`, a: `The closest rivers we cover are ${listJoin(list.slice(0, 3).map((x) => `the ${x.r.river} (${x.d} km)`))}. Each guide lists public access and the official season for every stretch.` },
    { q: `What fish can I catch near ${t.name}?`, a: `${listJoin(species)}, depending on the river and the season.` },
    salmonHere.length ? { q: `Where can I see the salmon run near ${t.name}?`, a: `${listJoin(salmonHere.map((s) => s.h1.replace(/^./, (c) => c.toUpperCase())))}. The run peaks in September.` } : null,
    { q: `What fishing zone is ${t.name} in?`, a: t.zone },
    { q: "Do I need a licence to fish here?", a: "Yes, most anglers need an Outdoors Card and a valid Ontario fishing licence. Ontario residents under 18 or 65 and over have different rules; check the official licensing page." },
  ].filter(Boolean);
  const body = `
<div class="wrap"><div class="crumbs"><a href="${HOME}">Home</a> › Fishing spots › ${esc(t.name)}</div></div>
<section class="section" style="padding-top:14px;"><div class="wrap"><article class="prose">
  <h1>Fishing spots in ${esc(t.name)}</h1>
  <p><b>${esc(t.local)}</b></p>
  <p>${esc(t.zone)}</p>
  <div class="cta-row"><a class="btn primary" href="${APP_URL}">See which river is fishing best today</a><span>7 days free</span></div>

  <h2>Rivers near ${esc(t.name)}</h2>
  <p>Distances are straight-line from central ${esc(t.name)}. Each guide shows what's there, when it's open and today's season status.</p>
  ${list.map(({ r, d }) => { const seo = RIVER_SEO[r.id] || {}; return `<h3><a href="${riverHref(r)}">${esc(r.river)}</a> <span class="src">${esc(r.section)} · ${d} km</span></h3><p>${esc(seo.hook || r.note)}</p>${liveStatus(r)}`; }).join("")}

  ${salmonHere.length ? `<h2>Salmon run near ${esc(t.name)}</h2><ul>${salmonHere.map((s) => `<li><a href="/salmon-run/${s.slug}/">${esc(s.h1)}</a></li>`).join("")}</ul>` : ""}

  ${cta(`Stop guessing which river to fish near ${esc(t.name)}`, `${BRAND} ranks every river near you each morning from live conditions, shows whether it's open, and tells you what to tie on.`)}

  <h2>Fishing near ${esc(t.name)} through the year</h2>
  ${townSeasons(list.map((x) => x.r))}

  <h2>Fishing near ${esc(t.name)}: good to know</h2>
  <ul>
    <li>Rules change by stretch, often at a road or bridge. Check the official season before you cast.</li>
    <li>Fish only where access is public or permitted, and respect posted private land.</li>
    <li>Trout and salmon struggle in warm water. In summer heat, fish early or rest them.</li>
  </ul>

  <h2>Frequently asked</h2>
  ${faqHtml(faqs)}
  <p style="margin-top:18px;"><a href="/rivers/">All river guides →</a> · <a href="/regulations/">Ontario fishing regulations by zone →</a> · <a href="/salmon-run/">Ontario salmon run →</a></p>
</article></div></section>`;
  return {
    title: t.title, description: clampDesc(`${t.local.split(". ")[0]}. River guides, official seasons and today's conditions near ${t.name}. Try it free.`, t.local.split(". ")[0] + "."),
    body, stickyCta: "See today's best river", schema: [faqSchema(faqs)],
  };
}
export { TOWNS, SALMON_SPOTS, RIVER_SEO };

// ── steelhead pages ──
// One page per river with steelhead, built around what searchers ask: when the
// fish run and which stretches are legal in fall, winter and early spring. The
// calendar is computed from the official snapshot, never written by hand.
const STL_DATES = [["Late fall", "2026-11-15T12:00"], ["Mid-winter", "2027-01-15T12:00"], ["Early spring", "2027-04-01T12:00"]];
const STATE_WORD = { open: "Open", closed: "Closed", check: "Check the rules", some: "Some species open", varies: "Varies" };
export const steelheadRivers = () => {
  const by = new Map();
  for (const r of RIVERS.filter((x) => (x.species || []).includes("STL"))) { const l = by.get(r.river) || []; l.push(r); by.set(r.river, l); }
  return [...by.entries()].map(([river, sections]) => ({ river, sections, slug: slug(river) }));
};
export function stlCalendar(sections) {
  const rows = [];
  for (const r of sections) {
    const b = resolveReach(r.id, SNAP); if (!b) continue;
    const at = STL_DATES.map(([, d]) => statusFor(b, ["STL"], new Date(d)).stretches);
    at[0].forEach((st, i) => rows.push({ label: `${st.label}${sections.length > 1 ? ` (${r.section.split(":")[0]})` : ""}`, states: at.map((x) => (x[i] ? x[i].state : "check")), zone: b.zone }));
  }
  return rows;
}
export function steelheadPage(g) {
  const Y = seasonYear();
  const first = g.sections[0];
  const seo = RIVER_SEO[first.id] || {};
  const rows = stlCalendar(g.sections);
  const zone = rows[0] ? rows[0].zone : null;
  const winterOpen = rows.filter((x) => x.states[1] === "open").map((x) => x.label);
  const georgian = /georgian|huron/i.test(first.region || "");
  const lake = georgian ? (/huron/i.test(first.region || "") && !/georgian/i.test(first.region || "") ? "Lake Huron" : "Georgian Bay") : /erie/i.test(first.region || "") ? "Lake Erie" : "Lake Ontario";
  const access = [...new Set(g.sections.flatMap((r) => (RIVER_SEO[r.id] || {}).access || []))];
  const salmon = SALMON_SPOTS.find((s) => g.sections.some((r) => r.id === s.river));
  const faqs = [
    { q: `When do steelhead run in the ${g.river}?`, a: `Fresh steelhead push in from ${lake} with the cold rains of October and November, a few hold in deep pools through winter, and a second run comes in March and April to spawn. Drop-back fish head back to the lake through April and early May.` },
    { q: `Can you fish the ${g.river} for steelhead in winter?`, a: winterOpen.length ? `Yes, on part of it. In mid-winter these stretches are open for rainbow trout under the official rules: ${winterOpen.join("; ")}. Everything else waits for the fourth Saturday in April.` : `Not on the stretches we cover. They are closed for rainbow trout in mid-winter and reopen with the trout opener on the fourth Saturday in April, or have rules you should check on the zone page.` },
    { q: `What is the best bait for steelhead on the ${g.river}?`, a: `Roe bags, single beads and small jigs under a float are the most common Ontario approach. On the fly, egg patterns, stoneflies and swung streamers all work. Match the size and colour to the clarity: bigger and brighter in stained water, smaller in clear water.` },
    { q: "How many steelhead can I keep?", a: `Steelhead are rainbow trout under Ontario's rules. In Zones 16, 17 and 20 the limit is two on a sport licence and one on a conservation licence, within the combined trout and salmon limit. Some stretches have their own rules, so check the stretch you fish.` },
  ];
  const cal = rows.length ? `<div class="tbl-wrap"><table class="months"><thead><tr><th style="text-align:left">Stretch</th>${STL_DATES.map(([l]) => `<th>${l}</th>`).join("")}</tr></thead><tbody>${rows.map((x) => `<tr><td style="white-space:normal">${esc(x.label)}</td>${x.states.map((s) => `<td><span class="st ${s === "open" ? "open" : s === "closed" ? "closed" : "check"}">${STATE_WORD[s] || "Check the rules"}</span></td>`).join("")}</tr>`).join("")}</tbody></table></div>
  <p class="src">Rainbow trout (steelhead) status on November 15, January 15 and April 1, from the official Ontario Fishing Regulations Summary. Rules can change, so check today's status above before you go.</p>` : `<p>See the <a href="/regulations/zone-${zone || 16}/">zone regulations</a> for this water.</p>`;
  const body = `
<div class="wrap"><div class="crumbs"><a href="${HOME}">Home</a> › <a href="/steelhead/">Steelhead</a> › ${esc(g.river)}</div></div>
<section class="section" style="padding-top:14px;"><div class="wrap"><article class="prose">
  <h1>${esc(g.river)} steelhead fishing</h1>
  <div class="meta">${esc(first.region)}${zone ? ` · <a href="/regulations/zone-${zone}/">FMZ ${zone}</a>` : ""}</div>
  ${g.sections.map((r) => `<div class="live-status" data-reach="${esc(r.id)}" data-sp="STL"><span class="st check">Checking today's steelhead season…</span> <span class="ls-note">${esc(r.section)}</span></div>`).join("")}
  <p><b>The ${esc(g.river)} gets ${lake} steelhead in fall and again in spring.</b> ${esc(seo.hook || first.note || "")}</p>
  <p>Below: when the fish are in, exactly which stretches are open in fall, winter and spring, and how to fish them.</p>
  <div class="cta-row"><a class="btn primary" href="${APP_URL}">See today's ${esc(g.river)} conditions</a><span>7 days free</span></div>

  <h2>When steelhead are in the ${esc(g.river)}</h2>
  <ul>
    <li><b>October to December:</b> the fall run. Fresh fish follow the salmon in on cold rains and feed on loose eggs.</li>
    <li><b>December to February:</b> holdover fish sit in the deepest, slowest pools. Mild days after a thaw are best, where it's open.</li>
    <li><b>March and April:</b> the spring run and spawning. Fish move on snowmelt and rain, then spawn on gravel in the upper reaches.</li>
    <li><b>Late April and May:</b> drop-backs. Spawned fish feed hard on their way back to ${lake}.</li>
  </ul>

  <h2>What's open for steelhead, season by season</h2>
  ${cal}
  ${winterOpen.length ? `<p>In winter, stick to: ${esc(winterOpen.join("; "))}. ` : `<p>None of the stretches we cover is open for steelhead in mid-winter. `}Most other water opens with the trout opener on the fourth Saturday in April (April 24, 2027).</p>

  ${cta(`Know when the ${esc(g.river)} is right`, `Steelhead move on rising water and bite as it drops and clears. ${BRAND} watches the ${esc(g.river)}'s flow, temperature and weather every morning and tells you when it's prime.`, "Try it free for 7 days")}

  <h2>Reading the ${esc(g.river)} for steelhead</h2>
  <p>Steelhead hold where the current slows to about walking pace in water a metre or two deep: tailouts above riffles, the inside seam of a bend, slots beside boulders and the soft water below log jams. In cold water they sit deeper and slower; as it warms toward 8 to 10°C they move up into faster runs.</p>
  <p>The best days come one or two days after rain, as the river drops and clears from muddy to a green tint. A blown-out river fishes poorly, and gin-clear, low water makes fish spooky, so fish small and light then.</p>

  <h2>Gear and flies</h2>
  <ul>
    <li><b>Float fishing:</b> a long rod with a centrepin or spinning reel, a float, and a roe bag, bead or small jig drifted just above bottom. See our <a href="/guides/float-fishing-for-steelhead/">float fishing guide</a>.</li>
    <li><b>Fly fishing:</b> egg patterns, stonefly and Pheasant Tail nymphs under an indicator, or swung Intruder style streamers in stained water.</li>
    <li><b>Spinning:</b> small spoons and inline spinners swung across and down through the runs.</li>
  </ul>

  <h2>Where to fish</h2>
  <p>${access.length ? `Public places include ${esc(listJoin(access))}. ` : ""}Fish only where access is public or permitted, stay off spawning gravel in spring, and check the stretch rules above before you cast.</p>

  <h2>Frequently asked</h2>
  ${faqHtml(faqs)}

  <p style="margin-top:18px;">${g.sections.map((r) => `<a href="${riverHref(r)}">${esc(r.river)}: ${esc(r.section)} guide</a>`).join(" · ")}${salmon ? ` · <a href="/salmon-run/${salmon.slug}/">${esc(salmon.place)} salmon run</a>` : ""} · <a href="/guides/steelhead-fishing-ontario/">Steelhead fishing in Ontario</a> · <a href="/steelhead/">All steelhead rivers</a></p>
  ${cta(`Fish the ${esc(g.river)} on the right day`, `Live conditions, the official season for your stretch and today's fly, for 30+ rivers and hundreds of spots Ontario-wide.`)}
</article></div></section>`;
  const title = [`${g.river} Steelhead: When They Run & What's Open`, `${g.river} Steelhead Fishing & Seasons`, `${g.river} Steelhead`].find((t) => t.length <= 60);
  return {
    title, body, stickyCta: "See today's conditions", winterOpen: winterOpen.length > 0, lake,
    description: clampDesc(`When steelhead run in the ${g.river}, which stretches are open in fall, winter and spring under Ontario's rules, and how to fish them. Updated for ${Y}.`, `${g.river} steelhead: run timing, open stretches and tactics.`),
    schema: [faqSchema(faqs)],
  };
}
export function steelheadHub() {
  const Y = seasonYear();
  const list = steelheadRivers().map((g) => ({ g, p: steelheadPage(g) }));
  const faqs = [
    { q: "When is steelhead season in Ontario?", a: "Steelhead run Ontario's Great Lakes tributaries in fall (October to December) and spring (March and April). Some lower stretches are open all year; most other water opens on the fourth Saturday in April." },
    { q: "Where can I fish for steelhead in winter in Ontario?", a: `On stretches open all year, mostly the lower ends of Lake Ontario tributaries. Of the rivers below, these have water open in mid-winter: ${listJoin(list.filter((x) => x.p.winterOpen).map((x) => x.g.river))}.` },
    { q: "What is a steelhead?", a: "A rainbow trout that lives in the Great Lakes and runs up rivers to spawn, the same way a salmon does. Ontario's rules count steelhead as rainbow trout." },
  ];
  const body = `
<div class="wrap"><div class="crumbs"><a href="${HOME}">Home</a> › Steelhead</div></div>
<section class="section" style="padding-top:14px;"><div class="wrap"><article class="prose">
  <h1>Ontario steelhead rivers ${Y}</h1>
  <p><b>Steelhead are Great Lakes rainbow trout that run up Ontario's rivers in fall and spring.</b> Each river below has its run timing and an official, stretch-by-stretch calendar of what's open in fall, winter and spring.</p>
  <div class="cta-row"><a class="btn primary" href="${APP_URL}">See which rivers are prime today</a><span>7 days free</span></div>
  <h2>Rivers with water open all winter</h2>
  <div class="rivers-grid">${list.filter((x) => x.p.winterOpen).map(({ g, p }) => `<a class="river-link" href="/steelhead/${g.slug}/"><b>${esc(g.river)}</b><span>${esc(p.lake)} steelhead, open stretches in winter</span></a>`).join("")}</div>
  <h2>Fall and spring rivers</h2>
  <div class="rivers-grid">${list.filter((x) => !x.p.winterOpen).map(({ g, p }) => `<a class="river-link" href="/steelhead/${g.slug}/"><b>${esc(g.river)}</b><span>${esc(p.lake)} steelhead</span></a>`).join("")}</div>
  ${cta("Steelhead bite on the drop", `Fish move on rising water and bite as it drops and clears. ${BRAND} reads every river's flow, temperature and weather each morning so you know where to go.`)}
  <h2>Frequently asked</h2>
  ${faqHtml(faqs)}
  <p style="margin-top:18px;"><a href="/guides/steelhead-fishing-ontario/">How to fish for steelhead in Ontario</a> · <a href="/guides/float-fishing-for-steelhead/">Float fishing for steelhead</a> · <a href="/regulations/">Fishing regulations by zone</a></p>
</article></div></section>`;
  return { title: `Ontario Steelhead Rivers ${Y}: Open in Winter & Spring`, description: `Ontario steelhead rivers with run timing and the official stretches open in fall, winter and spring, from the Credit and Humber to the Nottawasaga. Try it free.`, body, schema: [faqSchema(faqs)] };
}

// ── Buyer-intent pages (Oct 2026 research: marketing/seo-research-2026-10-intent.md) ──
// People searching "[river] fishing spots", "[river] water level" or "fly
// fishing app ontario" want exactly what the app does, so these pages answer
// that first and point to the app second.

// Rivers we cover in more than one section get one main page, so "Credit River
// fishing" has a single strong page instead of three competing ones.
export const RIVER_HUBS = [...new Set(RIVERS.map((r) => r.river))]
  .map((name) => ({ name, slug: slug(name), sections: RIVERS.filter((r) => r.river === name) }))
  .filter((h) => h.sections.length > 1);
export const hubFor = (r) => RIVER_HUBS.find((h) => h.name === r.river) || null;
// The main page for a river: its hub, or its only section page.
export const mainHref = (r) => (hubFor(r) ? `/rivers/${hubFor(r).slug}/` : riverHref(r));

// Live water level and flow from a Water Survey of Canada gauge on the same
// river, filled in the browser. Each stretch names its gauge by hand: the
// nearest gauge is often on a different creek, which would mislead.
export const GAUGES = block("const GAUGE_STATIONS = {");
export const gaugeBox = (r, label = "") => GAUGES[r.id] ? `<div class="gauge" data-station="${GAUGES[r.id]}">
  ${label ? `<p class="g-label"><b>${esc(label)}</b></p>` : ""}<div class="g-row"><div><b class="g-val" data-k="flow">…</b><span>Flow (m³/s)</span></div><div><b class="g-val" data-k="trend">…</b><span>Last 24 hours</span></div><div><b class="g-val" data-k="level">…</b><span>Water level (m)</span></div></div>
  <p class="g-note">Loading the latest reading from the Water Survey of Canada…</p></div>`
  : `<p>There's no federal flow gauge on this stretch of the ${esc(r.river)}. ${BRAND} estimates its conditions each morning from live weather and recent rain.</p>`;
export const GAUGE_SCRIPT = `<script>
(function(){document.querySelectorAll(".gauge").forEach(function(el){
  var note=el.querySelector(".g-note"),set=function(k,v){var x=el.querySelector('[data-k="'+k+'"]');if(x)x.textContent=v;};
  var st=el.dataset.station;
  fetch("/bk/api/gauge/"+st).then(function(r){return r.ok?r.json():null}).then(function(d){
    var g=d&&d.gauge; if(!g) throw 0;
    set("flow",g.discharge!=null?(+g.discharge).toFixed(1):"n/a"); set("level",g.level!=null?(+g.level).toFixed(2):"n/a");
    set("trend",g.trend==="rising"?"Rising":g.trend==="falling"?"Dropping":g.trend==="steady"?"Steady":"n/a");
    var mins=Math.max(0,Math.round((Date.now()-new Date(g.observedAt).getTime())/60000)),ago=mins<90?mins+" minutes ago":Math.round(mins/60)+" hours ago";
    var tip=g.trend==="rising"?"Rising water brings fresh fish in but can be high and dirty.":g.trend==="falling"?"Dropping, clearing water after a rise is often the best fishing.":"";
    note.innerHTML="Gauge: "+g.name.replace(/[<>&]/g,"")+", read "+ago+". "+tip+" Real-time provisional data from the <a href=\\"https://wateroffice.ec.gc.ca/report/real_time_e.html?stn="+st+"\\" rel=\\"noopener\\">Water Survey of Canada</a>.";
  }).catch(function(){ note.innerHTML="The gauge didn't answer just now. See it on the <a href=\\"https://wateroffice.ec.gc.ca/report/real_time_e.html?stn="+st+"\\" rel=\\"noopener\\">Water Survey of Canada</a>, or get today's read in the app."; });
});})();
</script>`;

// Water temperature: what it means for the fish, and how we get it (honestly:
// modelled each morning, plus readings members log on their trips).
export const waterTempHtml = (river) => `<p>Water temperature decides where trout and salmon hold and how hard they feed. Ontario's river gauges report level and flow, but very few report temperature, so ${BRAND} estimates the ${esc(river)}'s water temperature every morning from live air temperature, recent weather and the river's flow. Members can add a thermometer reading when they log a trip, which keeps the estimate honest.</p>
<div class="tbl-wrap"><table class="months temps"><thead><tr><th>Water temp</th><th>What the fish do</th></tr></thead><tbody>
<tr><td>Below 4°C</td><td>Slow. Fish deep, slow pools at midday with small flies.</td></tr>
<tr><td>4 to 10°C</td><td>Cool. Steelhead and browns feed, mostly near the bottom.</td></tr>
<tr><td>10 to 18°C</td><td>Prime. Trout feed actively; hatches and dries come into play.</td></tr>
<tr><td>18 to 20°C</td><td>Warm. Fish early, play fish fast, keep them in the water.</td></tr>
<tr><td>Above 20°C</td><td>Too warm. Trout are stressed; leave them be or find colder water.</td></tr>
</tbody></table></div>`;

const spotsList = (r) => {
  const seo = RIVER_SEO[r.id] || {};
  return listJoin(seo.access && seo.access.length ? seo.access : seo.towns || []);
};

export function riverHubPage(h) {
  const secs = h.sections;
  const species = [...new Set(secs.flatMap((r) => (r.species || []).filter((k) => SPECIES[k])))];
  const spNames = [...new Set(species.map(plain))];
  const towns = [...new Set(secs.flatMap((r) => (RIVER_SEO[r.id] || {}).towns || []))];
  const auth = authorityOf(secs[0].id);
  const zones = [...new Set(secs.map((r) => (officialStretches(r) || {}).zone).filter(Boolean))];
  const salmon = secs.map(salmonFor).find(Boolean);
  const faqs = [
    { q: `Where are the best fishing spots on the ${h.name}?`, a: secs.map((r) => `${r.section}: ${spotsList(r)}`).join(". ") + `. Fish only where access is public, and check the stretch rules first.` },
    { q: `What is the ${h.name} water level today?`, a: `The live readings on this page come from Water Survey of Canada gauges on the ${h.name} itself, one for each section. A rising level means fresh water and moving fish; the drop and clear a day or two later is usually the best fishing.` },
    { q: `What is the water temperature of the ${h.name}?`, a: `It changes by the day and by stretch. ${BRAND} estimates it every morning from live air temperature, weather and flow. Trout feed best between about 10 and 18°C and struggle above 20°C.` },
    { q: `Can you fly fish the ${h.name}?`, a: `Yes. The ${h.name} is a well-known fly fishing river for ${listJoin(spNames.slice(0, 3)).toLowerCase()}. Gear and bait rules differ by stretch, so check the section pages.` },
    { q: `Is the ${h.name} open for fishing?`, a: `Each section has its own official season. The status chips on this page are checked against the Ontario Fishing Regulations Summary twice a day.` },
  ];
  const body = `
<div class="wrap"><div class="crumbs"><a href="${HOME}">Home</a> › <a href="/rivers/">Rivers</a> › ${esc(h.name)}</div></div>
<section class="section" style="padding-top:14px;"><div class="wrap"><article class="prose">
  <h1>${esc(h.name)} fishing: spots, water level and conditions</h1>
  <div class="meta">${esc(secs[0].region)} · ${secs.length} sections${zones.length ? ` · ${zones.map((z) => `<a href="/regulations/zone-${z}/">FMZ ${z}</a>`).join(", ")}` : ""}</div>
  <p><b>The ${esc(h.name)} holds ${esc(listJoin(spNames))}${towns.length ? ` from ${esc(listJoin(towns.slice(0, 4)))}` : ""}.</b> This page has today's water level and flow, the season on each section, where you can fish, and the flies that work.</p>
  ${secs.map((r) => liveStatus(r).replace('<span class="ls-note">', `<span class="ls-note"><b>${esc(r.section)}</b>: `)).join("\n")}
  <div class="cta-row"><a class="btn primary" href="${APP_URL}">See today's ${esc(h.name)} score</a><span>7 days free, then $5.00/mo yearly</span></div>

  <h2>${esc(h.name)} water level and flow today</h2>
  ${secs.map((r) => gaugeBox(r, r.section)).join("\n")}

  <h2>${esc(h.name)} fishing spots</h2>
  <p>The ${esc(h.name)} changes character along its length, and so do the rules. Here are the public places on each section we cover:</p>
  ${secs.map((r) => `<h3><a href="${riverHref(r)}">${esc(r.section)}</a></h3>
  <p>${esc((RIVER_SEO[r.id] || {}).hook || r.note || "")}</p>
  <ul><li><b>Public access:</b> ${esc(spotsList(r))}</li><li><b>Fish:</b> ${esc(listJoin([...new Set((r.species || []).filter((k) => SPECIES[k]).map(plain))]))}</li></ul>
  <p><a href="${riverHref(r)}">${esc(r.section)}: seasons, tactics and spots →</a></p>`).join("\n")}
  <p>Park in public lots, follow posted signs and never cross private land without permission. ${BRAND} members get parking and walk-in routes for each section, and we never publish anyone's private spots.</p>
  ${salmon ? `<p>Here for the salmon? See <a href="/salmon-run/${salmon.slug}/">${esc(salmon.h1)}</a>, with this week's run status.</p>` : ""}

  ${cta(`Know which ${esc(h.name)} section to fish tomorrow`, `${BRAND} scores every section each morning from water temperature, flow and weather, tells you if it's open, and picks the fly.`, "Try it free for 7 days")}

  <h2>${esc(h.name)} water temperature</h2>
  ${waterTempHtml(h.name)}

  <h2>Fly fishing the ${esc(h.name)}</h2>
  <ul>${species.filter((k) => FLIES[k]).map((k) => `<li><b>${esc(plain(k))}:</b> ${esc(FLIES[k].fly)}.</li>`).join("")}</ul>
  <p>On spinning gear: ${species.filter((k) => FLIES[k]).slice(0, 3).map((k) => `${esc(plain(k)).toLowerCase()}, ${esc(FLIES[k].spin)}`).join("; ")}. Hook and bait rules vary by stretch.</p>

  <h2>Best months on the ${esc(h.name)}</h2>
  <div class="tbl-wrap"><table class="months"><thead><tr><th></th>${MONTHS.map((m) => `<th>${m[0]}</th>`).join("")}</tr></thead><tbody>${species.map((k) => `<tr><td>${esc(plain(k))}</td>${SPECIES[k].a.map((v, i) => `<td class="m${v >= 0.8 ? 3 : v >= 0.5 ? 2 : v >= 0.2 ? 1 : 0}" title="${MONTHS[i]}">${v >= 0.8 ? "●" : v >= 0.5 ? "◐" : v >= 0.2 ? "○" : ""}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
  <p class="src">● peak · ◐ good · ○ fair. When the fish are active, not the legal season.</p>

  <h2>${esc(h.name)} seasons by section</h2>
  <p>Ontario sets the season stretch by stretch, so the ${esc(h.name)} can be open in one place and closed a few kilometres away. From the Ontario Fishing Regulations Summary:</p>
  <ul>${secs.map((r) => { const o = officialStretches(r); const line = o && o.stretches[0] ? [...new Set(o.stretches[0].species.map((x) => `${x.official}: ${x.season}`))].slice(0, 3).join("; ") : "see the official summary"; return `<li><b><a href="${riverHref(r)}">${esc(r.section)}</a>:</b> ${esc(line)}${o && o.stretches.length > 1 ? ` (and ${o.stretches.length - 1} more stretch${o.stretches.length > 2 ? "es" : ""} with their own rules)` : ""}.</li>`; }).join("")}</ul>
  <p>Each section page lists every stretch, its limits and any sanctuaries, with links to the official wording.</p>

  <h2>Before you fish the ${esc(h.name)}</h2>
  <ul>
    <li>Carry your Outdoors Card and fishing licence.</li>
    <li>Check which section you'll fish and its season above. Rules often change at a bridge, dam or road.</li>
    <li>Look at the level and flow at the top of this page. After heavy rain the ${esc(h.name)} can rise fast and be dangerous to wade.</li>
    <li>Above about 20°C water, trout and salmon struggle. Fish early, or rest them.</li>
    <li>Pack out everything you bring, including line and bait containers.</li>
  </ul>

  ${auth ? `<p>The ${esc(auth.name)} manages the ${esc(h.name)} watershed and posts flood and safety messages at <a href="${auth.url}" rel="noopener">${esc(auth.url.replace(/^https?:\/\/(www\.)?/, ""))}</a>.</p>` : ""}

  <h2>Frequently asked</h2>
  ${faqHtml(faqs)}
  ${cta(`Fish the ${esc(h.name)} on the right day`, `Live conditions, the official season for your stretch and today's fly, for 30+ Southern Ontario rivers.`)}
</article></div></section>`;
  const title = `${h.name} Fishing: Spots, Water Level & Conditions`;
  const description = clampDesc(`${h.name} fishing spots, today's water level and flow, water temperature, seasons by section and the flies that work. Live conditions free for 7 days.`, `${h.name} fishing spots, live water level and flow, seasons and flies.`);
  return { title, description, body, stickyCta: "See today's conditions",
    schema: [faqSchema(faqs), { "@context": "https://schema.org", "@type": "Article", headline: title, description, mainEntityOfPage: `${SITE_URL}/rivers/${h.slug}/`, publisher: { "@type": "Organization", name: BRAND, url: SITE_URL } }] };
}

// Fly-fishing rivers grouped by the kind of water, for the fly fishing hub.
const flyGroups = () => {
  const by = (f) => RIVERS.filter(f);
  const lakeRun = (r) => (r.species || []).some((k) => ["STL", "CHN", "COH"].includes(k));
  const tail = by((r) => /tailwater/i.test(r.water || "") && !lakeRun(r));
  const cold = by((r) => !tail.includes(r) && !lakeRun(r));
  const run = by((r) => lakeRun(r));
  return [
    { h: "Tailwaters: trout all season", p: "Cold releases below the dams keep these rivers fishing when others run warm. Brown trout, hatches and dries.", list: tail },
    { h: "Cold creeks and headwaters: wild brook and brown trout", p: "Small, clear, spring-fed water. Light rods, short casts and a quiet approach.", list: cold },
    { h: "Lake-run rivers: steelhead, salmon and lake-run browns", p: "Fish run up from Lake Ontario, Lake Erie, Lake Huron and Georgian Bay in fall, winter and spring. Swing streamers or drift eggs and nymphs.", list: run },
  ];
};
const flyRow = (r) => `<li><a href="${riverHref(r)}"><b>${esc(r.river)}</b></a>, ${esc(r.section)}${liveStatus(r).replace('<div class="live-status"', '<div class="live-status mini"').replace(/<span class="ls-note">[^<]*<\/span>/, "")}</li>`;

export function flyFishingHub() {
  const groups = flyGroups();
  const faqs = [
    { q: "Where is the best fly fishing in Ontario?", a: "In Southern Ontario, the Grand River below Shand Dam, the Credit River, the Saugeen, the Nottawasaga and its cold tributaries, and the Beaver and Bighead rivers are the best-known fly water. The right one depends on the week: water temperature, flow and the season on each stretch." },
    { q: "When is the best time to fly fish in Ontario?", a: "For resident trout, late April to June and again in September, in water between about 10 and 18°C. For steelhead, October to December and March to April. Tailwaters like the Grand below Shand Dam fish through summer." },
    { q: "Do I need a licence to fly fish in Ontario?", a: "Yes. Most anglers need an Outdoors Card and a fishing licence, and every stretch has its own season, limits and gear rules. Check the stretch before you fish." },
    { q: "Is there an app for fly fishing in Ontario?", a: `${BRAND} scores Southern Ontario trout and steelhead rivers each morning from water temperature, flow and weather, shows the official season for each stretch, and picks the fly for the day.` },
  ];
  const body = `
<div class="wrap"><div class="crumbs"><a href="${HOME}">Home</a> › Fly fishing</div></div>
<section class="section" style="padding-top:14px;"><div class="wrap"><article class="prose">
  <h1>Fly fishing in Ontario: where to go and when</h1>
  <p><b>Southern Ontario has some of the best trout and steelhead fly fishing in eastern North America, within an easy drive of most of the province's anglers.</b> Here are the rivers, what they hold, what's open today, and the flies that work.</p>
  <div class="cta-row"><a class="btn primary" href="${APP_URL}">Find today's best fly water</a><span>7 days free, then $5.00/mo yearly</span></div>
  ${groups.map((g) => `<h2>${esc(g.h)}</h2><p>${esc(g.p)}</p><ul class="fly-list">${g.list.map(flyRow).join("")}</ul>`).join("\n")}
  ${cta("Which river is fishing best tomorrow?", `${BRAND} reads water temperature, flow and weather on every river each morning, scores them, and tells you the fly and technique. No more driving two hours to blown-out water.`, "Try it free for 7 days")}
  <h2>Ontario fly fishing through the year</h2>
  <ul>
    <li><b>Spring (March to May):</b> steelhead on the lake-run rivers, then the trout opener on the fourth Saturday in April across most of Zones 16 and 17. Nymphs and streamers in cold water.</li>
    <li><b>Early summer (June):</b> the best hatches of the year on the Grand and the cold creeks. Caddis, sulphurs and evening spinner falls.</li>
    <li><b>Summer (July and August):</b> fish the tailwaters and spring creeks early and late, and stop when water passes 20°C.</li>
    <li><b>Fall (September to November):</b> salmon runs, then steelhead and lake-run browns. Egg patterns, stoneflies and swung streamers.</li>
    <li><b>Winter:</b> a few stretches stay open for steelhead all year. Mild afternoons, slow and deep.</li>
  </ul>
  <h2>Flies that work in Ontario</h2>
  <ul>${["BNT", "BKT", "RBT", "STL", "CHN"].map((k) => `<li><b>${esc(plain(k))}:</b> ${esc(FLIES[k].fly)}.</li>`).join("")}</ul>
  <h2>Water temperature for fly fishing</h2>
  ${waterTempHtml("river")}
  <p>More: <a href="/guides/fly-fishing-near-toronto/">fly fishing near Toronto</a> · <a href="/fishing-spots/near-me/">trout and fly fishing spots near you</a> · <a href="/fly-fishing-app/">the ${BRAND} app</a> · <a href="/steelhead/">steelhead rivers</a></p>
  <h2>Frequently asked</h2>
  ${faqHtml(faqs)}
</article></div></section>`;
  return { title: "Fly Fishing in Ontario: Best Rivers, Spots & Seasons",
    description: "Where to fly fish in Southern Ontario: trout tailwaters, cold creeks and steelhead rivers, what's open today, the best months and the flies that work.",
    body, schema: [faqSchema(faqs)] };
}

export function flyAppPage() {
  const faqs = [
    { q: "Is there a fly fishing app for Ontario?", a: `Yes. ${BRAND} is built for Southern Ontario trout, steelhead and salmon rivers. Each morning it scores every river from live water temperature, flow and weather, shows the official season on each stretch, and tells you the fly and technique for the day.` },
    { q: "Is it on the App Store or Google Play?", a: "Not yet. It runs in your phone's browser and installs to your home screen in a few seconds on iPhone and Android, with alerts. Native apps are planned." },
    { q: "How much does it cost?", a: "Seven days free with every feature. Then $9.99 a month, or $59.99 a year ($5.00 a month). Cancel any time." },
    { q: "Which rivers does it cover?", a: `30+ Southern Ontario rivers and hundreds of spots, including the Grand, Credit, Humber, Saugeen, Nottawasaga, Ganaraska and Niagara, plus any creek or river you scout within your radius.` },
    { q: "Does it give away fishing spots?", a: "It shows public access, parking and walk-in routes for the rivers it covers. It never publishes members' private spots." },
  ];
  const feats = [
    ["A score for every river, every morning", "From live air and modelled water temperature, flow and recent rain, so you know which river is fishing before you drive."],
    ["Today's official season on your stretch", "Checked against the Ontario Fishing Regulations Summary twice a day, stretch by stretch, including sanctuaries."],
    ["The fly and technique for the day", "Picked from water temperature and clarity: nymph, dry-dropper, streamer or eggs, and which patterns."],
    ["Water level and flow", "The nearest federal gauge for each river, so you can see a rise or a drop at a glance."],
    ["Parking and walk-in routes", "Public access for each section, mapped. Never private spots."],
    ["Scout new water", "Find rivers and creeks within your radius, with species and depth from Ontario's official surveys."],
    ["Prime-condition alerts", "A notification when one of your saved rivers turns prime, at most twice a week per river."],
    ["Run tracker and trip log", "See where salmon and steelhead are running from members' sightings, and log your days, blanks included."],
  ];
  const body = `
<div class="wrap"><div class="crumbs"><a href="${HOME}">Home</a> › <a href="/fly-fishing/">Fly fishing</a> › The app</div></div>
<section class="section" style="padding-top:14px;"><div class="wrap"><article class="prose">
  <h1>The fly fishing app for Ontario rivers</h1>
  <p><b>${BRAND} tells you which Southern Ontario river to fish tomorrow, whether your stretch is open, and what to tie on.</b> It's made for trout, steelhead and salmon anglers, from first-timers to lifers.</p>
  <div class="cta-row"><a class="btn primary" href="${APP_URL}">Start your 7 free days</a><span>Then $9.99/mo, or $59.99/yr</span></div>
  <h2>What it does</h2>
  <ul>${feats.map(([a, b]) => `<li><b>${esc(a)}.</b> ${esc(b)}</li>`).join("")}</ul>
  <h2>Why not just check the weather?</h2>
  <p>Air temperature and rain tell you half the story. Trout and steelhead respond to water temperature, flow and clarity, and to what's legal on the stretch you're standing on. Checking a gauge, a forecast, the regulations summary and a fishing forum for every river takes an hour. The app does it for 30+ rivers before you wake up.</p>
  <h2>How to get it</h2>
  <ol><li>Open <a href="${APP_URL}">muddyyorkfishing.ca</a> on your phone and create a free account.</li><li>Start the 7-day trial. You won't be charged if you cancel before it ends.</li><li>Add it to your home screen: Share, then Add to Home Screen on iPhone; the menu, then Install app on Android.</li></ol>
  ${cta("Try every feature free for 7 days", "Live conditions, the official season for your stretch and today's fly, for 30+ Southern Ontario rivers.", "Start free")}
  <p>Where to go: <a href="/fly-fishing/">fly fishing in Ontario</a> · <a href="/fishing-spots/near-me/">fishing spots near you</a> · <a href="/rivers/">all river guides</a></p>
  <h2>Frequently asked</h2>
  ${faqHtml(faqs)}
</article></div></section>`;
  return { title: "Ontario Fly Fishing App: River Conditions & Spots",
    description: "The fly fishing app for Southern Ontario: a daily score for 30+ rivers, today's season on your stretch, water level and the fly to use. 7 days free.",
    body, stickyCta: "Start free",
    schema: [faqSchema(faqs), { "@context": "https://schema.org", "@type": "SoftwareApplication", name: BRAND, applicationCategory: "SportsApplication",
      operatingSystem: "iOS, Android, Web", url: SITE_URL + "/fly-fishing-app/", description: "Daily river conditions, official seasons and fly picks for Southern Ontario trout, steelhead and salmon rivers.",
      offers: [{ "@type": "Offer", price: "9.99", priceCurrency: "CAD", description: "Monthly, after a 7-day free trial" }, { "@type": "Offer", price: "59.99", priceCurrency: "CAD", description: "Yearly, after a 7-day free trial" }] }] };
}

export function nearMePage() {
  const list = RIVERS.map((r) => ({ r, towns: ((RIVER_SEO[r.id] || {}).towns || []).slice(0, 2) }));
  const faqs = [
    { q: "Where can I go trout fishing near me?", a: "Tap \"Use my location\" and this page sorts 30+ Southern Ontario trout, steelhead and salmon rivers by distance from you, with what each holds and whether it's open today. Your location stays on your phone." },
    { q: "Where can I fly fish near Toronto?", a: "The Credit, Humber and Rouge are inside the GTA, Bronte and Sixteen Mile creeks are in Oakville, Duffins Creek is in Ajax and Pickering, and the Grand, Ganaraska and Nottawasaga are a short drive away." },
    { q: "What is the best time to go trout fishing near me?", a: "Cool, cloudy days and the first and last light of the day, in water between about 10 and 18°C. For steelhead, the day or two after a rain as the river drops and clears." },
    { q: "Are these public fishing spots?", a: "Each river page lists public access along the stretch we cover. Fish only where access is public or permitted, and respect posted private land." },
  ];
  const body = `
<div class="wrap"><div class="crumbs"><a href="${HOME}">Home</a> › <a href="/fishing-spots/">Fishing spots</a> › Near me</div></div>
<section class="section" style="padding-top:14px;"><div class="wrap"><article class="prose">
  <h1>Trout and fly fishing spots near me</h1>
  <p><b>Find the closest trout, steelhead and salmon rivers to you in Southern Ontario, what they hold and whether they're open today.</b> Your location is used on your phone only and never sent to us.</p>
  <p><button class="btn primary" id="near-btn" type="button" style="border:none;cursor:pointer">Use my location</button> <span id="near-msg" class="src"></span></p>
  <ul class="fly-list" id="near-list">${list.map(({ r, towns }) => `<li data-lat="${r.lat}" data-lon="${r.lon}"><a href="${riverHref(r)}"><b>${esc(r.river)}</b></a>, ${esc(r.section)}${towns.length ? ` · ${esc(listJoin(towns))}` : ""} <span class="near-km src"></span> <span class="src">· ${esc(listJoin([...new Set((r.species || []).filter((k) => SPECIES[k]).map(plain))].slice(0, 3)))}</span>${liveStatus(r).replace('<div class="live-status"', '<div class="live-status mini"').replace(/<span class="ls-note">[^<]*<\/span>/, "")}</li>`).join("")}</ul>
  ${cta("Which one is fishing best today?", `Distance is only half of it. ${BRAND} scores every river each morning from water temperature, flow and weather, and tells you the fly to use.`, "Try it free for 7 days")}
  <p>By town: <a href="/fishing-spots/">fishing spots in Toronto, Mississauga, Oakville and more</a> · <a href="/fly-fishing/">fly fishing in Ontario</a></p>
  <h2>Frequently asked</h2>
  ${faqHtml(faqs)}
</article></div></section>`;
  return { title: "Trout & Fly Fishing Spots Near Me: Southern Ontario",
    description: "The nearest trout, steelhead and salmon rivers to you in Southern Ontario, sorted by distance, with what they hold and whether they're open today.",
    body, stickyCta: "See today's conditions", schema: [faqSchema(faqs)] };
}
export const NEAR_ME_SCRIPT = `<script>
(function(){var b=document.getElementById("near-btn"),m=document.getElementById("near-msg"),ul=document.getElementById("near-list");if(!b)return;
  var R=6371,t=function(x){return x*Math.PI/180};
  b.addEventListener("click",function(){ if(!navigator.geolocation){m.textContent="Location isn't available in this browser.";return;}
    m.textContent="Finding you…";
    navigator.geolocation.getCurrentPosition(function(p){var la=p.coords.latitude,lo=p.coords.longitude;
      var items=[].slice.call(ul.children).map(function(li){var a=+li.dataset.lat,o=+li.dataset.lon;
        var s=Math.pow(Math.sin(t(a-la)/2),2)+Math.cos(t(la))*Math.cos(t(a))*Math.pow(Math.sin(t(o-lo)/2),2);
        var d=Math.round(R*2*Math.atan2(Math.sqrt(s),Math.sqrt(1-s)));li.querySelector(".near-km").textContent="· "+d+" km";return {li:li,d:d};});
      items.sort(function(x,y){return x.d-y.d}).forEach(function(x){ul.appendChild(x.li)});m.textContent="Sorted by distance from you.";
    },function(){m.textContent="Location was blocked. The list is in alphabetical order by region.";},{maximumAge:600000,timeout:10000});
  });})();
</script>`;
