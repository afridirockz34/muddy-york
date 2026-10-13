// Late fall and winter pages (marketing/seo-research-2026-10-winter.md):
// the fishing licence guide, the free fishing weekend, the Toronto
// Sportsmen's Show, winter fishing near Toronto, gift memberships, and the ice
// fishing lakes. Facts come from ontario.ca (fetched October 13, 2026), the
// synced regulations snapshot, Ontario's lake records and the show's own site.
// Where something isn't published yet (2027 free fishing dates), we say so.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { APP_URL, BRAND, HOME, esc } from "../lib/site-shell.js";
import { cta, faqHtml, faqSchema, clampDesc, steelheadRivers, stlCalendar, SNAP } from "./seo-pages.mjs";
import { lakeBundle, statusFor } from "../lib/regs-status.js";
import { ICE_LAKES } from "../lib/ice-lakes.js";
import { iceSpeciesIn, iceSpeciesName } from "../lib/ice.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const LAKE_RECORDS = JSON.parse(fs.readFileSync(path.join(ROOT, "marketing", "seo-data", "ice-lakes-ara.json"), "utf8"));
const OFFICIAL = {
  licence: "https://www.ontario.ca/page/fishing-licence-ontario-and-canadian-residents",
  fees: "https://www.ontario.ca/document/ontario-fishing-regulations-summary/recreational-fishing-licences-and-fees",
  card: "https://www.ontario.ca/page/get-outdoors-card-and-licence-summary",
  free: "https://www.ontario.ca/page/free-family-fishing",
  summary: "https://www.ontario.ca/document/ontario-fishing-regulations-summary",
  show: "https://www.torontosportshow.ca",
  lifesaving: "https://www.lifesavingsociety.com",
  redcross: "https://www.redcross.ca",
};
const ext = (href, label) => `<a href="${href}" rel="noopener">${esc(label)}</a>`;
const page = (crumb, h1, inner) => `
<div class="wrap"><div class="crumbs"><a href="${HOME}">Home</a> › ${crumb}</div></div>
<section class="section" style="padding-top:14px;"><div class="wrap"><article class="prose">
  <h1>${esc(h1)}</h1>
  ${inner}
</article></div></section>`;
const table = (head, rows) => `<div class="tbl-wrap"><table class="months"><thead><tr>${head.map((h, i) => `<th${i ? "" : ' style="text-align:left"'}>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td${i ? "" : ' style="white-space:normal;text-align:left"'}>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;

// ── Ontario fishing licence ──
export function licencePage() {
  const faqs = [
    { q: "How much is a fishing licence in Ontario?", a: "For Ontario residents, a one-year sport fishing licence is listed at $26.57 and a one-year conservation licence at $15.07, plus an Outdoors Card ($8.57) that lasts three calendar years. A one-day sport licence is $12.21 and doesn't need an Outdoors Card. Check ontario.ca for current fees." },
    { q: "Who doesn't need a fishing licence in Ontario?", a: "Ontario and Canadian residents under 18 or 65 and older can fish with government ID showing their name and date of birth. Veterans and active Canadian Armed Forces members living in Ontario, people with an accessible parking permit or a CNIB card, and Indigenous people exercising their rights in their traditional or treaty area are also covered. Everyone follows the regulations." },
    { q: "What is the difference between a sport and a conservation licence?", a: "A sport licence gives the full catch and possession limits (the S numbers in the regulations). A conservation licence costs less and has lower limits (the C numbers), and suits anglers who release most of their fish." },
    { q: "Can I show my licence on my phone?", a: "Yes, but only as the PDF licence summary from the Fish and Wildlife Licensing Service. Ontario says a photo or screenshot is not valid. Keep your phone charged, or carry a paper copy." },
    { q: "When can I fish without a licence?", a: "During Ontario's four free fishing periods each year, Canadian residents can fish without a licence. Conservation limits and all other rules still apply, and you carry government ID." },
  ];
  const body = page("Guides › Fishing licence", "Ontario fishing licence: costs, who needs one, and how to buy it", `
  <p><b>Most anglers in Ontario need two things: an Outdoors Card and a fishing licence.</b> Here's what each one is, what they cost, who doesn't need them, and the details that trip people up, all from ontario.ca.</p>
  <div class="cta-row"><a class="btn primary" href="${APP_URL}">See which rivers are fishing today</a><span>7 days free</span></div>

  <h2>What you need</h2>
  <ul>
    <li><b>Outdoors Card:</b> a plastic ID card, valid for three calendar years. It costs $8.57 plus HST to buy or renew. Renewals open on the first Tuesday of December each year.</li>
    <li><b>Fishing licence:</b> valid for one or three calendar years. Choose a <b>sport</b> licence (full limits) or a <b>conservation</b> licence (lower limits, lower price).</li>
    <li><b>Fishing for one day only?</b> A one-day sport licence doesn't need an Outdoors Card.</li>
  </ul>

  <h2>Fees for Ontario residents</h2>
  ${table(["Licence", "Fee"], [["Three-year sport", "$79.71"], ["One-year sport", "$26.57"], ["One-day sport (no Outdoors Card needed)", "$12.21"], ["Three-year conservation", "$45.21"], ["One-year conservation", "$15.07"]])}
  <h2>Fees for Canadian residents (outside Ontario)</h2>
  ${table(["Licence", "Fee"], [["Three-year sport", "$167.43"], ["One-year sport", "$55.81"], ["One-day sport (no Outdoors Card needed)", "$15.21"], ["Three-year conservation", "$100.29"], ["One-year conservation", "$33.43"]])}
  <p class="src">Fees as listed in the ${ext(OFFICIAL.fees, "Ontario Fishing Regulations Summary")} on October 13, 2026. Non-Canadian residents have their own fees, including eight-day licences.</p>

  <h2>Who doesn't need to buy a licence</h2>
  <ul>
    <li>Ontario and Canadian residents <b>under 18 or 65 and older</b>, carrying government ID with their name and date of birth.</li>
    <li><b>Veterans and active Canadian Armed Forces members</b> who live in Ontario, carrying their Forces ID or service card.</li>
    <li>People with an Ontario <b>accessible parking permit</b> or a <b>CNIB</b> card, and people who need direct help to fish because of a disability.</li>
    <li><b>Indigenous people</b> exercising Aboriginal or treaty rights within their traditional or treaty area.</li>
  </ul>
  <p>All of them still follow the seasons and limits; most fish under sport licence limits. The full list is on ${ext(OFFICIAL.licence, "ontario.ca")}.</p>

  <h2>How to buy</h2>
  <ul>
    <li>Online through the Fish and Wildlife Licensing Service (Visa or Mastercard), by phone at 1-800-288-1155, at a licence issuer, or at a participating ServiceOntario.</li>
    <li>You can fish right away with your <b>licence summary</b> while the plastic card comes in the mail (up to 20 days).</li>
    <li>Ontario plans to replace the licensing system with a new one in early 2027, so the online steps may change.</li>
  </ul>

  <h2>Carrying it on the water</h2>
  <p>Carry your Outdoors Card, plus your licence summary if the licence isn't printed on the back. A licence summary on your phone counts only as the PDF from the licensing service. Ontario says a photo or screenshot is not valid.</p>

  <h2>Free fishing in Ontario</h2>
  <p>Four times a year, Canadian residents can fish without a licence, starting with Family Fishing Weekend in February. See our <a href="/guides/free-fishing-weekend-ontario/">free fishing weekend guide</a> for the dates and rules.</p>

  ${cta("Licence sorted. Now pick the river.", `${BRAND} checks live conditions on 30+ Southern Ontario rivers every morning and shows the official season for your stretch, so you only drive to water that's open and fishing.`)}

  <h2>Frequently asked</h2>
  ${faqHtml(faqs)}
  <p style="margin-top:18px;"><a href="/regulations/">Fishing regulations by zone</a> · <a href="/guides/ontario-trout-opener/">Trout opener 2027</a> · <a href="/steelhead/">Steelhead rivers</a> · <a href="/rivers/">River guides</a></p>`);
  return { title: "Ontario Fishing Licence 2027: Cost & Who Needs One",
    description: "Ontario fishing licence fees, the Outdoors Card, sport vs conservation licences, who fishes free, and how to buy. From ontario.ca, updated for 2027.",
    body, schema: [faqSchema(faqs)] };
}

// ── Free fishing weekend ──
export function freeFishingPage() {
  const faqs = [
    { q: "When is the free fishing weekend in Ontario in 2027?", a: "Ontario hasn't posted the 2027 dates yet. In 2026, Family Fishing Weekend was February 14 to 16, the Family Day long weekend. If 2027 follows the same pattern it would be February 13 to 15, 2027. Check ontario.ca before you go." },
    { q: "Who can fish for free?", a: "Canadian residents. You don't buy a licence, but you carry government ID showing your name and date of birth." },
    { q: "What rules apply on free fishing days?", a: "Conservation licence catch limits, size limits, sanctuaries and every other fishing regulation still apply." },
  ];
  const winter = steelheadRivers().filter((g) => stlCalendar(g.sections).some((x) => x.states[1] === "open")).map((g) => `<a href="/steelhead/${g.slug}/">${esc(g.river)}</a>`);
  const body = page("Guides › Free fishing weekend", "Free fishing weekend in Ontario", `
  <p><b>Four times a year, Canadian residents can fish anywhere in Ontario without buying a licence.</b> The first comes in February, on the Family Day long weekend, which makes it a good time to try ice fishing or winter steelhead.</p>
  <div class="cta-row"><a class="btn primary" href="${APP_URL}">Find water that's open this weekend</a><span>7 days free</span></div>

  <h2>The free fishing periods</h2>
  <p>Ontario's 2026 free fishing periods were:</p>
  <ul>
    <li><b>Family Fishing Weekend:</b> February 14 to 16, 2026</li>
    <li><b>Mother's Day Weekend:</b> May 9 to 10, 2026</li>
    <li><b>Father's Day Weekend:</b> June 20 to 21, 2026</li>
    <li><b>Family Fishing Week:</b> June 27 to July 5, 2026</li>
  </ul>
  <p>The 2027 dates aren't posted yet. Family Fishing Weekend has been the Family Day long weekend; in 2027 Family Day is Monday, February 15. Check ${ext(OFFICIAL.free, "ontario.ca")} before you plan.</p>

  <h2>The rules still apply</h2>
  <ul>
    <li>Follow <b>conservation licence</b> catch limits (the C numbers in the regulations).</li>
    <li>Obey size limits, seasons and sanctuaries.</li>
    <li>Carry government ID with your name and date of birth.</li>
  </ul>

  <h2>Where to fish in February near Toronto</h2>
  <p>Most inland trout water is closed in February, but two kinds of fishing are wide open:</p>
  <ul>
    <li><b>River stretches open all year</b> for steelhead and other lake-run fish: ${winter.join(", ")}. Our <a href="/guides/winter-fishing-near-toronto/">winter fishing guide</a> lists exactly which stretches.</li>
    <li><b>Ice fishing</b> on lakes like <a href="/ice-fishing/lake-simcoe/">Lake Simcoe</a>, where perch, crappie and pike are open in winter. See the <a href="/ice-fishing/">ice fishing guide</a>, and always confirm the ice yourself.</li>
  </ul>
  <p>Ontario's TackleShare program also lends rods and reels for free at some provincial parks, conservation authorities and libraries.</p>

  ${cta("Make the free weekend count", `${BRAND} shows which rivers are open and fishing well that morning, with the official season for each stretch.`)}
  <h2>Frequently asked</h2>
  ${faqHtml(faqs)}
  <p style="margin-top:18px;"><a href="/guides/ontario-fishing-licence/">Ontario fishing licence guide</a> · <a href="/steelhead/">Steelhead rivers</a> · <a href="/ice-fishing/">Ice fishing</a> · <a href="/regulations/">Regulations by zone</a></p>`);
  return { title: "Free Fishing Weekend Ontario 2027: Dates & Rules",
    description: "Ontario's free fishing periods for Canadian residents, the Family Day weekend in February, the rules that still apply, and where to fish near Toronto.",
    body, schema: [faqSchema(faqs)] };
}

// ── Toronto Sportsmen's Show ──
export function sportsmenShowPage() {
  const faqs = [
    { q: "When is the Toronto Sportsmen's Show 2027?", a: "March 18 to 21, 2027, at the International Centre in Mississauga, according to the show's website." },
    { q: "Where do I buy tickets?", a: "On the show's official website, torontosportshow.ca." },
    { q: "When does fishing season open after the show?", a: "The trout opener in most of Southern Ontario is the fourth Saturday in April, which is April 24, 2027, about five weeks after the show." },
  ];
  const body = page("Guides › Toronto Sportsmen's Show", "Toronto Sportsmen's Show 2027: a guide for anglers", `
  <p><b>The Toronto Sportsmen's Show runs March 18 to 21, 2027, at the International Centre in Mississauga.</b> It's Ontario's big spring show for fishing, boating and the outdoors, and it lands right as the spring steelhead run starts and five weeks before the trout opener.</p>
  <div class="cta-row"><a class="btn ghost" href="${OFFICIAL.show}" rel="noopener">Show dates and tickets</a><a class="btn primary" href="${APP_URL}">Plan your spring rivers</a></div>

  <h2>Make the most of it as an angler</h2>
  <ul>
    <li><b>Go with a list.</b> Write down the rivers and fish you want to chase this spring, then ask exhibitors and guides about those, not fishing in general.</li>
    <li><b>Compare gear in hand.</b> Rods, reels and waders are easier to choose when you can hold them side by side.</li>
    <li><b>Book guides early.</b> Spring steelhead and the trout opener are busy weekends.</li>
    <li><b>Check your licence.</b> Your Outdoors Card lasts three calendar years; renewals open each December. Our <a href="/guides/ontario-fishing-licence/">licence guide</a> has the fees.</li>
  </ul>

  <h2>What's happening on the rivers in March</h2>
  <ul>
    <li><b>Spring steelhead</b> start moving up Lake Ontario and Georgian Bay tributaries on snowmelt and rain. See our <a href="/steelhead/">steelhead rivers</a>, with the stretches open in early spring.</li>
    <li><b>Ice season ends</b> on most southern lakes as the ice softens. Lake Simcoe's lake trout and whitefish seasons close on March 15.</li>
    <li><b>The trout opener</b> on April 24, 2027 opens most inland trout water. See our <a href="/guides/ontario-trout-opener/">opener guide</a>.</li>
  </ul>

  ${cta("Leave the show with a plan", `${BRAND} ranks 30+ Southern Ontario rivers every morning on live conditions and the official season for each stretch, so your first spring trip lands on the right day.`)}
  <h2>Frequently asked</h2>
  ${faqHtml(faqs)}
  <p class="src">Show details from ${ext(OFFICIAL.show, "torontosportshow.ca")} on October 13, 2026. ${BRAND} isn't affiliated with the show.</p>
  <p><a href="/steelhead/">Steelhead rivers</a> · <a href="/guides/ontario-trout-opener/">Trout opener 2027</a> · <a href="/rivers/">River guides</a> · <a href="/guides/ontario-fishing-licence/">Fishing licence</a></p>`);
  return { title: "Toronto Sportsmen's Show 2027: An Angler's Guide",
    description: "Toronto Sportsmen's Show 2027 runs March 18 to 21 at the International Centre, Mississauga. How anglers can make the most of it, and what's biting in March.",
    body, schema: [faqSchema(faqs)] };
}

// ── Winter fishing near Toronto (open water) ──
export function winterFishingPage() {
  const rows = [];
  for (const g of steelheadRivers()) for (const x of stlCalendar(g.sections)) if (x.states[1] === "open") rows.push([`<a href="/steelhead/${g.slug}/">${esc(g.river)}</a>`, esc(x.label)]);
  const faqs = [
    { q: "Can you fish in winter near Toronto?", a: "Yes. Several river stretches are open all year for steelhead, brown trout and salmon, mostly the lower ends of Lake Ontario tributaries, and nearby lakes like Lake Simcoe offer ice fishing." },
    { q: "What can you catch in winter in Ontario rivers?", a: "Mostly steelhead (lake-run rainbow trout) that came in during the fall, plus some lake-run brown trout, on the stretches that stay open." },
    { q: "Is ice fishing better than river fishing in winter?", a: "They're different. Rivers offer steelhead on open-all-year stretches on mild days. Ice fishing offers perch, crappie, pike and, on some lakes, lake trout, whitefish and walleye, but depends on safe ice, which you have to check yourself." },
  ];
  const body = page("Guides › Winter fishing", "Winter fishing near Toronto: open-water rivers and ice", `
  <p><b>You don't have to stop fishing when the trout season closes.</b> Near Toronto, the lower ends of several Lake Ontario tributaries stay open all year, and from January the lakes north and east of the city freeze for ice fishing.</p>
  <div class="cta-row"><a class="btn primary" href="${APP_URL}">See today's open water</a><span>7 days free</span></div>

  <h2>River stretches open in mid-winter</h2>
  <p>Computed from the official Ontario Fishing Regulations Summary for rainbow trout (steelhead), as of January 15:</p>
  ${table(["River", "Stretch"], rows)}
  <p class="src">Rules change, sometimes at a single bridge. Check the stretch on the river's page, which shows today's status.</p>

  <h2>Winter steelhead basics</h2>
  <ul>
    <li><b>Pick mild days.</b> A thaw or a few days above freezing gets fish moving.</li>
    <li><b>Fish slow and deep.</b> In near-freezing water steelhead hold in the slowest, deepest pools.</li>
    <li><b>Stay off shelf ice</b> along the banks, and wear a wading belt.</li>
  </ul>
  <p>More in our <a href="/blog/winter-steelhead-fishing-ontario/">winter steelhead guide</a>.</p>

  <h2>Ice fishing within an hour or two</h2>
  <p>When the lakes lock up, ${"<a href=\"/ice-fishing/lake-simcoe/\">Lake Simcoe</a>"} is the classic trip from Toronto, with ${"<a href=\"/ice-fishing/lake-scugog/\">Lake Scugog</a>"}, ${"<a href=\"/ice-fishing/rice-lake/\">Rice Lake</a>"} and the ${"<a href=\"/ice-fishing/bay-of-quinte/\">Bay of Quinte</a>"} further east. Each guide shows what's open in winter under the official rules. We never rate ice safety: check it yourself and ask locally.</p>

  ${cta("Know which water is fishing this weekend", `${BRAND} checks every river's flow, temperature and weather each morning and shows the official season for your stretch.`)}
  <h2>Frequently asked</h2>
  ${faqHtml(faqs)}
  <p style="margin-top:18px;"><a href="/steelhead/">All steelhead rivers</a> · <a href="/ice-fishing/">Ice fishing in Ontario</a> · <a href="/guides/ontario-fishing-licence/">Fishing licence</a> · <a href="/regulations/">Regulations by zone</a></p>`);
  return { title: "Winter Fishing Near Toronto: Open Rivers & Ice",
    description: "Where you can still fish near Toronto in winter: river stretches open all year for steelhead, and nearby ice fishing lakes, from the official Ontario rules.",
    body, schema: [faqSchema(faqs)] };
}

// ── Gifts ──
export const GIFT_SCRIPT = `<script>
(function(){ var f=document.getElementById("gift-form"); if(!f) return;
  f.addEventListener("submit",function(e){ e.preventDefault(); var b=f.querySelector("button"), m=document.getElementById("gift-msg");
    b.disabled=true; b.textContent="Opening checkout…"; m.textContent="";
    var d={recipientName:f.recipientName.value,recipientEmail:f.recipientEmail.value,fromName:f.fromName.value,message:f.message.value};
    fetch("/bk/gift/checkout",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(d)})
      .then(function(r){return r.json().then(function(j){return {ok:r.ok,j:j};});})
      .then(function(x){ if(x.ok&&x.j.url){ location.href=x.j.url; } else { throw new Error(x.j&&x.j.error||"failed"); } })
      .catch(function(err){ b.disabled=false; b.textContent="Buy the gift: $59.99"; m.textContent=/recipient/.test(err.message)?"That recipient email doesn't look right.":"Checkout couldn't start. Try again in a moment, or email info@muddyyorkfishing.ca."; });
  });
})();
</script>`;
export function giftsPage() {
  const faqs = [
    { q: "How does a gift membership work?", a: "You pay once for a year. We email you a gift code right away (and to the recipient too, if you add their email). They open the link, sign in or make a free account, and their year starts immediately." },
    { q: "Does it renew automatically?", a: "No. A gift is a one-time payment for one year. Nothing is charged to the recipient." },
    { q: "Can I send it on a specific day?", a: "Leave the recipient's email blank and the code comes only to you, so you can give it whenever you like, in a card or by email." },
  ];
  const ideas = [
    ["Polarized sunglasses", "The single best upgrade for seeing fish and reading water."],
    ["A wading staff and wading belt", "Safer crossings on slippery Ontario rivers, especially in spring flows."],
    ["A day with a local guide", "The fastest way to learn a new river. Book early for spring."],
    ["Nippers, forceps and a small net", "Kinder, quicker releases."],
    ["A fly box with local patterns", "Egg patterns and stoneflies for steelhead, small dries for brook trout."],
  ];
  const body = page("Gifts", "Fishing gifts for Ontario anglers", `
  <p><b>The gift that gets them on the right river on the right day:</b> a year of ${BRAND}. Live conditions on 30+ Southern Ontario trout and salmon rivers every morning, the official season for every stretch, and what to tie on.</p>

  <div class="callout" style="text-align:left">
    <h3 style="text-align:left">Give a year of ${BRAND}: $59.99</h3>
    <p style="color:var(--dim);margin-bottom:14px">One payment, no renewal. We email the gift code instantly.</p>
    <form id="gift-form" style="display:grid;gap:10px;max-width:460px">
      <label>Their name (optional)<br><input name="recipientName" maxlength="60" style="width:100%;padding:10px;border:1px solid var(--line);border-radius:8px;font:inherit"></label>
      <label>Their email (optional, we'll send it to them too)<br><input name="recipientEmail" type="email" maxlength="200" style="width:100%;padding:10px;border:1px solid var(--line);border-radius:8px;font:inherit"></label>
      <label>From (optional)<br><input name="fromName" maxlength="60" style="width:100%;padding:10px;border:1px solid var(--line);border-radius:8px;font:inherit"></label>
      <label>A short note (optional)<br><textarea name="message" maxlength="300" rows="3" style="width:100%;padding:10px;border:1px solid var(--line);border-radius:8px;font:inherit"></textarea></label>
      <button class="btn primary" type="submit" style="cursor:pointer;border:none">Buy the gift: $59.99</button>
      <p id="gift-msg" role="status" style="color:var(--brick);font-weight:600"></p>
    </form>
    <p class="src">Secure checkout by Stripe. Prices in CAD.</p>
  </div>

  <h2>More gift ideas for river anglers</h2>
  <ul>${ideas.map(([t, d]) => `<li><b>${t}:</b> ${d}</li>`).join("")}</ul>

  <h2>Frequently asked</h2>
  ${faqHtml(faqs)}
  <p style="margin-top:18px;"><a href="${HOME}">What ${BRAND} does</a> · <a href="/rivers/">River guides</a> · <a href="/steelhead/">Steelhead rivers</a> · <a href="/salmon-run/">Salmon run</a></p>`);
  return { title: "Fishing Gifts Ontario: Gift a Year of Muddy York",
    description: "Give an Ontario angler a year of live river conditions, official seasons and fly picks. $59.99, one payment, code emailed instantly. Plus gift ideas.",
    body, schema: [faqSchema(faqs)] };
}
export function giftThanksPage() {
  const body = page("Gifts", "Thank you. Your gift is on its way.", `
  <p>We've emailed the gift code to you${""}, and to the recipient if you added their email. It can take a minute or two to arrive; check your spam folder if you don't see it.</p>
  <p>To redeem, they open the link in the email, sign in or create a free account, and their year starts right away.</p>
  <p>Questions? Email <a href="mailto:info@muddyyorkfishing.ca">info@muddyyorkfishing.ca</a>.</p>
  <p style="margin-top:18px;"><a class="btn ghost" href="${HOME}">Back to ${BRAND}</a></p>`);
  return { title: "Thank you for your gift | Muddy York Fishing", description: "Your Muddy York Fishing gift membership is on its way.", body };
}

// ── Ice fishing ──
const ICE_DATES = [["Mid-January", "2027-01-15T12:00"], ["Mid-February", "2027-02-15T12:00"], ["March 10", "2027-03-10T12:00"], ["March 25", "2027-03-25T12:00"]];
const ZONE_OF = { "lake-simcoe": 16, "lake-nipissing": 11, "bay-of-quinte": 20, "rice-lake": 17, "lake-scugog": 17 };
export function iceLakeData(l) {
  const rec = (LAKE_RECORDS[l.id] && LAKE_RECORDS[l.id].ara && LAKE_RECORDS[l.id].ara[0]) || {};
  const species = l.species || iceSpeciesIn(rec.FISH_SPECIES_SUMMARY);
  const zone = ZONE_OF[l.id];
  const bundle = lakeBundle(zone, l.name, SNAP);
  const rows = species.map((code) => {
    const at = ICE_DATES.map(([, d]) => statusFor(bundle, [code], new Date(d)).stretches[0].species[0]);
    return { code, name: iceSpeciesName(code), season: at[0] && at[0].season, states: at.map((x) => (x ? x.state : "check")) };
  });
  return { rec, species, zone, bundle, rows, maxDepth: l.araName ? null : rec.MAXIMUM_DEPTH, meanDepth: l.araName ? null : rec.MEAN_DEPTH };
}
export const FREEZE_SCRIPT = `<script>
(function(){ document.querySelectorAll(".freeze").forEach(function(el){
  var u="https://api.open-meteo.com/v1/forecast?latitude="+el.dataset.lat+"&longitude="+el.dataset.lon+"&daily=temperature_2m_mean,temperature_2m_min&past_days=92&forecast_days=1&timezone=America%2FToronto";
  fetch(u).then(function(r){return r.json()}).then(function(d){ var t=d.daily.temperature_2m_mean.slice(0,-1).filter(function(x){return x!=null});
    var start=0,warm=0; t.forEach(function(v,i){ if(v>2){warm++; if(warm>=5) start=i+1;} else warm=0; });
    var fdd=0; for(var i=start;i<t.length;i++) if(t[i]<0) fdd+=-t[i]; fdd=Math.round(fdd);
    var lows=d.daily.temperature_2m_min.slice(-8,-1), avgLow=Math.round(lows.reduce(function(a,b){return a+b},0)/lows.length);
    var stage=fdd<100?"Not cold enough yet for ice fishing to be likely":fdd<250?"Ice building: wait for operators and local reports":"Established cold: ice is common by now, but never uniform";
    el.querySelector(".fz-text").innerHTML="<b>"+fdd+" freezing degree-days</b> this winter (last 90 days). Average overnight low this past week: "+avgLow+"°C. "+stage+".";
  }).catch(function(){});
});})();
</script>`;
const STATE_TXT = { open: "Open", closed: "Closed", check: "Check the rules", some: "Some open", varies: "Varies" };
export function iceLakePage(l) {
  const d = iceLakeData(l);
  const openWinter = d.rows.filter((r) => r.states[0] === "open" || r.states[1] === "open").map((r) => r.name.toLowerCase());
  const closedWinter = d.rows.filter((r) => r.states[0] === "closed" && r.states[1] === "closed").map((r) => r.name.toLowerCase());
  const entries = d.bundle ? d.bundle.stretches[0].entries : [];
  const faqs = [
    { q: `When does ice fishing start on ${l.name}?`, a: `It depends on the weather each winter, not a date. Ice forms after a long run of freezing weather and is never uniform. Hut operators and local reports are the best guide; never go out on ice you haven't checked.` },
    { q: `What can you catch ice fishing on ${l.name}?`, a: `Ontario's lake records list ${d.rows.map((r) => r.name.toLowerCase()).join(", ")} in ${l.name}. Under the current rules, ${openWinter.length ? `${openWinter.join(", ")} can be fished in mid-winter` : "check each species' season"}${closedWinter.length ? `, and ${closedWinter.join(", ")} ${closedWinter.length > 1 ? "are" : "is"} closed in winter` : ""}.` },
    { q: `What fishing zone is ${l.name} in?`, a: `Fisheries Management Zone ${d.zone}.${entries.length ? ` ${l.name} also has its own rules in the regulations, shown on this page.` : ""}` },
    { q: "Do I need a fishing licence to ice fish?", a: "Yes, the same Outdoors Card and fishing licence as any other fishing in Ontario, unless you're exempt (for example under 18 or 65 and older) or it's a free fishing weekend." },
  ];
  const body = page(`<a href="/ice-fishing/">Ice fishing</a> › ${esc(l.name)}`, `Ice fishing ${l.name}`, `
  <p><b>${esc(l.name)} is in Fisheries Management Zone ${d.zone}${d.maxDepth ? `, up to ${Math.round(+d.maxDepth)} m deep (mean ${Math.round(+d.meanDepth)} m)` : ""}.</b> Here's what Ontario's records say lives there, what's open through the ice season under the official rules, and how cold this winter has been so far.</p>
  ${l.araName ? `<p class="src">Ontario's lake records file the Bay of Quinte with Lake Ontario, so we list the bay's own ice-fishing species rather than all of Lake Ontario's, and don't show depths.</p>` : ""}
  <div class="callout" style="text-align:left;border-color:var(--brick)"><h3 style="text-align:left;color:var(--brick)">We can't see the ice</h3>
    <p style="color:var(--text)">Nothing on this page tells you the ice is safe. Check thickness yourself as you go, ask the hut operators and locals, and follow ice safety guidance from the ${ext(OFFICIAL.redcross, "Canadian Red Cross")} and the ${ext(OFFICIAL.lifesaving, "Lifesaving Society")}.</p></div>

  <h2>How cold this winter has been</h2>
  <div class="freeze" data-lat="${l.lat}" data-lon="${l.lon}" style="padding:12px 14px;border:1px solid var(--line);border-radius:10px;background:var(--panel)"><span class="fz-text">Loading this winter's temperatures near ${esc(l.name)}…</span></div>
  <p class="src">Freezing degree-days add up how far below 0°C each day's average air temperature was. More usually means more ice, but currents, springs, snow cover and pressure cracks make ice uneven. This is weather, not an ice report.</p>

  <h2>What's open through the ice season</h2>
  ${table(["Fish", ...ICE_DATES.map(([t]) => t)], d.rows.map((r) => [`<b>${esc(r.name)}</b><br><span class="src">${esc(r.season || "see the rules")}</span>`, ...r.states.map((s) => `<span class="st ${s === "open" ? "open" : s === "closed" ? "closed" : "check"}">${STATE_TXT[s] || "Check the rules"}</span>`)]))}
  <p class="src">From the Ontario Fishing Regulations Summary (Zone ${d.zone}${entries.length ? ` and ${esc(l.name)}'s own exceptions` : ""}). Limits and size rules apply; see the official wording below.</p>
  ${entries.length ? `<p class="src">Official wording: ${entries.map((e) => `<a href="${esc(e.link)}" rel="nofollow">${esc(e.text.length > 90 ? e.text.slice(0, 88) + "…" : e.text)}</a>`).join(" · ")}</p>` : ""}
  ${d.bundle && d.bundle.stretches[0].note ? `<p class="src">${esc(d.bundle.stretches[0].note)}</p>` : ""}

  ${l.areas.length ? `<h2>Where anglers head</h2><p>Common starting points on ${esc(l.name)} include ${esc(l.areas.join(", "))}. Conditions differ a lot from bay to bay, so ask locally about the exact area you plan to fish.</p>` : ""}

  <h2>Before you go out</h2>
  <ul>
    <li>Check the ice with a spud bar or auger as you walk, not just at the shore.</li>
    <li>Stay away from pressure ridges, river mouths, bridges, docks and springs, where ice is often thinner.</li>
    <li>Wear a flotation suit or PFD, carry ice picks and a throw rope, and never go alone.</li>
    <li>Tell someone where you're going and when you'll be back.</li>
    <li>Hut operators rent heated huts on many big lakes and know their ice; using one is the easiest way to start.</li>
  </ul>

  ${cta("Ice season in the app", `When the ice season is on, ${BRAND} adds an Ice fishing mode: lakes near you with how cold the winter has been, what's open today under the official rules, and a fishing-weather outlook. It never rates the ice.`)}
  <h2>Frequently asked</h2>
  ${faqHtml(faqs)}
  <p style="margin-top:18px;"><a href="/ice-fishing/">All ice fishing lakes</a> · <a href="/regulations/zone-${d.zone}/">Zone ${d.zone} regulations</a> · <a href="/guides/ontario-fishing-licence/">Fishing licence</a> · <a href="/guides/winter-fishing-near-toronto/">Winter fishing near Toronto</a></p>`);
  return { title: `Ice Fishing ${l.name}: What's Open & Freeze Progress`.length <= 60 ? `Ice Fishing ${l.name}: What's Open & Freeze Progress` : `Ice Fishing ${l.name}: Seasons & Conditions`,
    description: clampDesc(`Ice fishing ${l.name}: species from Ontario's lake records, what's open in winter under the official rules, and how cold this winter has been. Safety first.`, `Ice fishing ${l.name}: species, winter seasons and freeze progress.`),
    body, schema: [faqSchema(faqs)] };
}
export function iceHubPage() {
  const faqs = [
    { q: "Where is the best ice fishing near Toronto?", a: "Lake Simcoe is the best known, about an hour north, with perch, crappie, pike, lake trout and whitefish. Lake Scugog and Rice Lake are closer to the east for perch, crappie and pike, and the Bay of Quinte is known for winter walleye." },
    { q: "Is walleye open in winter in Southern Ontario?", a: "It depends on the zone and the lake. Zone 16 (including Lake Simcoe) is open January 1 to March 15, Zone 20 (Bay of Quinte) January 1 to March 1, and Zone 17 (Rice Lake, Lake Scugog) is closed in winter; Lake Scugog's walleye are closed all year." },
    { q: "How do you know when the ice is safe?", a: "You check it yourself, every time, and ask the people who know the lake. We show how cold the winter has been, which helps you judge when ice season is likely, but no website can see the ice." },
  ];
  const cards = ICE_LAKES.map((l) => { const d = iceLakeData(l); return `<a class="river-link" href="${l.page}"><b>${esc(l.name)}</b><span>Zone ${d.zone} · ${d.rows.map((r) => r.name.toLowerCase()).slice(0, 4).join(", ")}</span></a>`; }).join("");
  const body = page("Ice fishing", "Ice fishing in Ontario", `
  <p><b>From January, the lakes north and east of Toronto freeze and a different season starts.</b> Each lake guide shows what Ontario's records say lives there, what's open through the ice season under the official rules, and how cold this winter has been so far.</p>
  <div class="callout" style="text-align:left;border-color:var(--brick)"><h3 style="text-align:left;color:var(--brick)">We never rate the ice</h3><p style="color:var(--text)">We don't rate ice safety and never will. Check the ice yourself as you go, ask hut operators and locals, and follow ${ext(OFFICIAL.redcross, "Canadian Red Cross")} and ${ext(OFFICIAL.lifesaving, "Lifesaving Society")} guidance.</p></div>
  <h2>Lake guides</h2>
  <div class="rivers-grid">${cards}</div>
  <h2>Winter seasons at a glance</h2>
  <ul>
    <li><b>Yellow perch and crappie</b> are open all year in Zones 16, 17 and 20.</li>
    <li><b>Walleye</b>: Zone 16 January 1 to March 15; Zone 20 January 1 to March 1; Zone 17 closed in winter (second Saturday in May to November 15).</li>
    <li><b>Lake Simcoe lake trout, whitefish and cisco</b>: January 1 to March 15 under the lake's own rules.</li>
  </ul>
  <p class="src">From the Ontario Fishing Regulations Summary. Lakes can have their own exceptions; each lake guide applies them.</p>
  ${cta("Ice season in the app", `When the ice season is on, ${BRAND} shows lakes near you with this winter's freeze progress, what's open today and a fishing-weather outlook. It never rates the ice.`)}
  <h2>Frequently asked</h2>
  ${faqHtml(faqs)}
  <p style="margin-top:18px;"><a href="/guides/winter-fishing-near-toronto/">Winter fishing near Toronto</a> · <a href="/guides/ontario-fishing-licence/">Fishing licence</a> · <a href="/guides/free-fishing-weekend-ontario/">Free fishing weekend</a> · <a href="/regulations/">Regulations by zone</a></p>`);
  return { title: "Ice Fishing Ontario 2027: Lakes, Seasons & Safety", description: "Ice fishing near Toronto: Lake Simcoe, Scugog, Rice Lake, Bay of Quinte and Nipissing, with official winter seasons, species and this winter's freeze progress.", body, schema: [faqSchema(faqs)] };
}
