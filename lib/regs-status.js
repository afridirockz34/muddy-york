// Official-regulation status for a river section, built from the parsed
// ontario.ca zone pages (lib/regs-parse.js) and the section → entries mapping
// (lib/regs-reaches.js).
//
// resolveReach() runs on the server after each sync and produces a small,
// self-contained bundle: the matched official entries (verbatim, with deep
// links) plus the zone-wide seasons. statusFor() runs anywhere (app or server)
// and turns that bundle into today's open / closed status. Whenever the text
// can't be read exactly, or a mapping no longer matches, the answer is
// "Check regs" — never a guessed "open".

import { zoneUrl, textFragmentUrl, zoneCorpus } from "./regs-parse.js";
import { seasonWindows, inWindows, windowsLabel } from "./regs-season.js";
import { REACH_REGS, OFFICIAL_SPECIES } from "./regs-reaches.js";

const norm = (s) => String(s || "").toLowerCase().replace(/[’‘`]/g, "'").replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
const enc = (s) => encodeURIComponent(s).replace(/-/g, "%2D").replace(/,/g, "%2C").replace(/&/g, "%26");

// Link to a zone-wide species section ("Rainbow trout" followed by "Season").
// `next` is the word that immediately follows the heading ("Season", "Limits"),
// which picks the zone-wide heading over other mentions of the species.
export const speciesSectionUrl = (zone, species, next) => `${zoneUrl(zone)}#:~:text=${enc(species)}${next ? ",-" + enc(next) : ""}`;

function matchSpec(parsed, spec) {
  const has = (spec.has || []).map(norm), not = (spec.not || []).map(norm), name = norm(spec.name);
  const ok = (text) => { const t = norm(text); return t.startsWith(name) && has.every((h) => t.includes(h)) && !not.some((n) => t.includes(n)); };
  const out = [];
  if (spec.kind === "spx") parsed.speciesExceptions.forEach((g) => g.waters.forEach((w) => { if (ok(w.text)) out.push({ kind: "spx", text: w.text, species: g.species, season: g.season || null, limits: g.limits || null }); }));
  if (spec.kind === "wb") parsed.waterbody.forEach((e) => { if (ok(e.text)) out.push({ kind: "wb", text: e.text, rules: e.rules.slice() }); });
  if (spec.kind === "sanct") parsed.sanctuaries.forEach((s) => s.waters.forEach((w) => { if (!w.seeExceptions && ok(w.text)) out.push({ kind: "sanct", text: w.text, period: s.period }); }));
  const corpus = zoneCorpus(parsed);
  return out.map((e) => ({ ...e, link: textFragmentUrl(parsed.url, e.text, corpus) }));
}

// Species listed as "not present ... closed to fishing all year" in the zone notes.
function closedSpeciesOf(parsed) {
  const g = parsed.general.join("\n");
  const i = g.toLowerCase().indexOf("closed to fishing all year");
  if (i < 0) return [];
  return g.slice(i + "closed to fishing all year".length).replace(/^[:\s]+/, "").split(/\n|,/).slice(0, 6)
    .map((s) => s.trim().toLowerCase()).filter((s) => s && s.length < 30);
}

// Server side: bundle the official entries for one app section.
export function resolveReach(id, zones) {
  const map = REACH_REGS[id];
  if (!map) return null;
  const parsed = zones[map.zone];
  if (!parsed) return null;
  const zoneWide = {};
  parsed.zoneWide.forEach((z) => { if (z.season || z.limits) zoneWide[z.species] = { season: z.season || null, limits: z.limits || null, link: speciesSectionUrl(map.zone, z.species, (z.lines[0] || "").split(/[\s:]/)[0]) }; });
  return {
    id, zone: map.zone, url: parsed.url,
    zoneWide, closedSpecies: closedSpeciesOf(parsed),
    stretches: map.stretches.map((st) => {
      const entries = [], unmatched = [];
      for (const spec of st.match) { const hits = matchSpec(parsed, spec); if (hits.length) entries.push(...hits); else unmatched.push(spec); }
      return { label: st.label, note: st.note || null, review: !!st.review, zoneWideOnly: !!st.zoneWideOnly, entries, unmatched };
    }),
  };
}

// Does an official species phrase cover this species? Handles lists and
// "All species (except …)".
const KEYWORD = { "Rainbow trout": "rainbow", "Brown trout": "brown trout", "Brook trout": "brook trout",
  "Pacific salmon": "pacific salmon", "Atlantic salmon": "atlantic salmon", "Lake trout": "lake trout",
  "Largemouth and smallmouth bass combined": "bass", "Northern pike": "pike", "Walleye and sauger combined": "walleye" };
export function covers(phrase, official) {
  const p = norm(phrase), k = KEYWORD[official] || norm(official);
  const all = p.match(/^all species(?: \(except ([^)]*)\))?/);
  if (all) return !(all[1] && all[1].includes(k));
  return p.includes(k);
}

const CANDR = /S-0 and C-0/i;

// One species on one stretch → { state, season, closures, notes, sources }.
function speciesOnStretch(bundle, st, code, date) {
  const official = OFFICIAL_SPECIES[code];
  const year = date.getFullYear();
  const notes = [], closures = [], sources = [];
  if (!official) return { code, state: "check", season: null, notes: ["Not covered by the official species list."], closures, sources };

  const zw = bundle.zoneWide[official];
  let seasonText = zw ? zw.season : null, seasonFrom = zw ? { label: `Zone ${bundle.zone} zone-wide`, link: zw.link } : null;
  let limits = zw ? zw.limits : null;
  if (!zw && bundle.closedSpecies.some((s) => covers(s, official))) {
    seasonText = "closed all year"; seasonFrom = { label: `Zone ${bundle.zone}: not present, closed all year`, link: bundle.url };
  }

  for (const e of st.entries) {
    if (e.kind === "spx" && e.species && covers(e.species, official) && e.season) {
      seasonText = e.season; seasonFrom = { label: "Species exception", link: e.link };
      if (e.limits && !/zone-wide limits apply/i.test(e.limits)) limits = e.limits;
    }
    if (e.kind === "sanct") {
      if (/night/i.test(e.period)) notes.push(`${e.period.replace(/^no fishing\s*[-–]\s*/i, "")} — no night fishing (sanctuary).`);
      else closures.push({ text: e.period, link: e.link });
    }
    if (e.kind === "wb") for (const r of e.rules) {
      if (/night/i.test(r)) { notes.push(r); continue; }
      if (/fish sanctuary/i.test(r)) { closures.push({ text: r, link: e.link }); continue; }
      const open = r.match(/^(.*?)\s+-\s+open from (.+)$/i);
      if (open && covers(open[1], official)) { seasonText = open[2]; seasonFrom = { label: "Waterbody exception", link: e.link }; continue; }
      if (CANDR.test(r)) { const who = r.split(" - ")[0]; if (covers(who, official)) notes.push(`Catch-and-release: ${r}`); continue; }
      if (!open && !/ - S-\d/.test(r)) notes.push(r); // gear rules etc. apply to everyone
      else if (/ - S-\d/.test(r) && covers(r.split(" - ")[0], official)) notes.push(`Limits: ${r}`);
    }
  }
  if (seasonFrom) sources.push(seasonFrom);
  const windows = seasonWindows(seasonText, year);
  const closeWins = closures.map((c) => seasonWindows(c.text, year));
  let state;
  if (windows == null || closeWins.some((w) => w == null)) state = "check";
  else if (closeWins.some((w) => inWindows(date, w))) state = "closed";
  else state = inWindows(date, windows) ? "open" : "closed";
  return {
    code, official, state, season: seasonText, seasonLabel: windowsLabel(windows), limits,
    closures: closures.map((c, i) => ({ ...c, label: windowsLabel(closeWins[i]) })), notes: [...new Set(notes)], sources,
  };
}

const LABEL = { open: "In season", closed: "Closed now", check: "Check regs", some: "Some species open", varies: "Varies by stretch" };
const TONE = { open: "green", closed: "red", check: "amber", some: "amber", varies: "amber" };
const roll = (states) => states.every((s) => s === states[0]) ? states[0] : (states.includes("check") ? "check" : "some");

// Today's status for a section (bundle from resolveReach) and its species codes.
export function statusFor(bundle, speciesCodes, date = new Date()) {
  if (!bundle) return null;
  const codes = [...new Set((speciesCodes || []).filter((c) => OFFICIAL_SPECIES[c]))];
  const stretches = bundle.stretches.map((st) => {
    const species = codes.map((c) => speciesOnStretch(bundle, st, c, date));
    // Collapse codes that share an official species (e.g. steelhead + rainbow).
    const seen = new Set(); const uniq = species.filter((s) => (seen.has(s.official) ? false : seen.add(s.official)));
    let state = uniq.length ? roll(uniq.map((s) => s.state)) : "check";
    if (st.review || st.unmatched.length) state = "check";
    return { label: st.label, note: st.note, review: st.review, unmatched: st.unmatched.length, state, stateLabel: LABEL[state], tone: TONE[state], species: uniq, entries: st.entries };
  });
  const states = stretches.map((s) => s.state);
  const state = states.every((s) => s === states[0]) ? states[0] : "varies";
  return { state, label: LABEL[state], tone: TONE[state], zone: bundle.zone, url: bundle.url, stretches };
}
