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
const SNAP = JSON.parse(fs.readFileSync(path.join(ROOT, "backend", "src", "data", "regs-zones.json"), "utf8").replace(/[—–]/g, "-")).zones;

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
const cta = (h, p, label = "Start your free 7-day trial") => `<div class="callout"><h3>${h}</h3><p style="color:var(--dim);margin-bottom:14px;">${p}</p><a class="btn primary" href="${APP_URL}">${label}</a></div>`;
const faqHtml = (faqs) => faqs.map((f) => `<details><summary>${esc(f.q)}</summary><p>${f.html || esc(f.a)}</p></details>`).join("");
const faqSchema = (faqs) => ({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) });
const riverCard = (x, note) => `<a class="river-link" href="${riverHref(x)}"><b>${esc(x.river)}</b><span>${esc(note || x.section)}</span></a>`;
// Live "open today?" chip: filled in the browser from the backend's twice-daily
// official sync, so the static page never shows a stale season.
const liveStatus = (r) => `<div class="live-status" data-reach="${esc(r.id)}" data-sp="${esc((r.species || []).join(","))}">
  <span class="st check">Checking today's season…</span> <span class="ls-note">Official Ontario regulations, checked twice a day</span></div>`;
export const LIVE_STATUS_SCRIPT = `<script>
(function(){document.querySelectorAll(".live-status").forEach(function(el){
  var u="/bk/api/regs/status?id="+encodeURIComponent(el.dataset.reach)+"&sp="+encodeURIComponent(el.dataset.sp||"");
  fetch(u).then(function(r){return r.ok?r.json():null}).then(function(d){ if(!d) return;
    var cls=d.state==="open"?"open":d.state==="closed"?"closed":"check";
    var label=d.state==="open"?"In season today":d.state==="closed"?"Closed today":d.state==="varies"?"Varies by stretch today":d.state==="some"?"Some species open today":"Check regs today";
    var st=el.querySelector(".st"); st.className="st "+cls; st.textContent=label;
    if(d.stretches&&d.stretches.length>1){ el.querySelector(".ls-note").textContent=d.stretches.map(function(s){return s.label+": "+s.stateLabel}).join(" · "); }
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
    { q: `Where can I fish the ${r.river}?`, a: `Public places along this section include ${listJoin(seo.access && seo.access.length ? seo.access : towns)}. Only fish where access is public or permitted, respect posted private land, and check the stretch rules above.` },
    { q: "Do I need a fishing licence?", a: `Yes, most anglers need an Outdoors Card and a valid Ontario fishing licence.${zone ? ` This river is in Fisheries Management Zone ${zone}.` : ""}` },
  ];

  const body = `
<div class="wrap"><div class="crumbs"><a href="${HOME}">Home</a> › <a href="/rivers/">Rivers</a> › ${esc(r.river)}</div></div>
<section class="section" style="padding-top:14px;"><div class="wrap"><article class="prose">
  <h1>${esc(r.river)} fishing${esc(where)}</h1>
  <div class="meta">${esc(r.section)} · ${esc(region)}${zone ? ` · <a href="/regulations/zone-${zone}/">FMZ ${zone}</a>` : ""}</div>
  ${liveStatus(r)}
  <p><b>${esc(seo.hook)}</b></p>
  <p>${esc(r.note)}</p>
  <div class="cta-row"><a class="btn primary" href="${APP_URL}">See today's ${esc(r.river)} conditions</a><span>7 days free, then $5.00/mo yearly</span></div>

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

  <h2>Flies and lures for the ${esc(r.river)}</h2>
  <ul>${spKeys.filter((k) => FLIES[k]).map((k) => `<li><b>${esc(plain(k))}:</b> on the fly rod, ${esc(FLIES[k].fly)}. On spinning gear, ${esc(FLIES[k].spin)}.</li>`).join("")}</ul>
  <p>Gear and bait rules can differ by stretch, so match what you tie on to the rules for your water above. ${BRAND} picks the technique and fly for the day from live water temperature and clarity.</p>

  <h2>Reading the water</h2>
  <p>${esc(readWaterHtml(r))}</p>
  <p>Before a trip, check the river's flow on the <a href="https://wateroffice.ec.gc.ca" rel="noopener">Water Survey of Canada</a> real-time gauges${authorityOf(r.id) ? ` and any flood or safety messages from the <a href="${authorityOf(r.id).url}" rel="noopener">${esc(authorityOf(r.id).name)}</a>, which manages the ${esc(r.river)} watershed and publishes maps of its conservation areas and trails` : ""}.</p>

  <h2>Where to fish the ${esc(r.river)}</h2>
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

function clampDesc(full, short) {
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
  ${SALMON_SPOTS.map((s) => { const r = RIVERS.find((x) => x.id === s.river); return `<h3><a href="/salmon-run/${s.slug}/">${esc(s.h1)}</a></h3><p>${esc(s.watch)}</p>${r ? `<p class="src">River guide: <a href="${riverHref(r)}">${esc(r.river)} fishing</a></p>` : ""}`; }).join("")}

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
    title: `${s.title}`, description: clampDesc(`${s.watch.split(". ")[0]}. When it peaks in ${Y}, where to watch and where it's legal to fish.`, s.watch.split(". ")[0] + "."),
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
