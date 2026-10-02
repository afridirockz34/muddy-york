// Parser for the official Ontario Fishing Regulations Summary zone pages
// (ontario.ca/document/ontario-fishing-regulations-summary/fisheries-management-zone-N).
//
// The pages are plain, consistently structured HTML: <h2> sections, <h3>
// species / closure periods, and each water as an <li> or a "<p><strong>Name</strong>
// - location</p>" followed by a <ul> of rules. The parser keeps every rule's
// official wording verbatim — the app shows that text, so nothing is paraphrased.

export const REGS_BASE = "https://www.ontario.ca/document/ontario-fishing-regulations-summary";
export const zoneUrl = (zone) => `${REGS_BASE}/fisheries-management-zone-${zone}`;

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", ndash: "–", mdash: "—", deg: "°", prime: "′", Prime: "″", eacute: "é", egrave: "è" };
export function decode(s) {
  return String(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => (n in ENTITIES ? ENTITIES[n] : m));
}
// Visible text of an HTML fragment, whitespace collapsed (<br> → newline).
export function textOf(html) {
  return decode(String(html).replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, ""))
    .split("\n").map((l) => l.replace(/[ \t ]+/g, " ").trim()).filter(Boolean).join("\n");
}

// Split a "Name - location" line. The name is the bold part when present.
function splitWater(html, text) {
  const strong = html.match(/^\s*<strong>(.*?)<\/strong>/i);
  if (strong) {
    const name = textOf(strong[1]);
    const rest = text.slice(name.length).replace(/^\s*[-–]\s*/, "").trim();
    return { name, location: rest };
  }
  const i = text.indexOf(" - ");
  return i > 0 ? { name: text.slice(0, i).trim(), location: text.slice(i + 3).trim() } : { name: text.trim(), location: "" };
}

function seasonLimits(text) {
  const out = {};
  const season = text.match(/Season\s*:\s*([^\n]+?)(?=\s*Limits\s*:|\n|$)/i);
  const limits = text.match(/Limits\s*:\s*([^\n]+)/i);
  if (season) out.season = season[1].trim();
  if (limits) out.limits = limits[1].trim();
  return out;
}

// Parse one zone page. Returns null when the page doesn't look like a zone page
// (layout change, error page) so callers keep their last good copy.
export function parseZonePage(html, zone) {
  const start = html.search(/<h2[^>]*>\s*General information/i);
  const endM = html.slice(Math.max(0, start)).search(/<h2[^>]*>\s*(Ministry of Natural Resources|Questions or comments)/i);
  if (start < 0) return null;
  const body = endM > 0 ? html.slice(start, start + endM) : html.slice(start);

  const out = { zone, url: zoneUrl(zone), general: [], zoneWide: [], speciesExceptions: [], waterbody: [], sanctuaries: [] };
  let section = null, h3 = null, group = null, entry = null, sanct = null, zw = null;

  const re = /<(h2|h3|h4|p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = re.exec(body))) {
    const tag = m[1].toLowerCase(), inner = m[2], text = textOf(inner);
    if (!text) continue;
    if (tag === "h2") {
      const t = text.toLowerCase();
      section = t.startsWith("general") ? "general" : t.startsWith("zone-wide") ? "zoneWide"
        : t.startsWith("species exceptions") ? "species" : t.startsWith("waterbody exceptions") ? "waterbody"
        : t.startsWith("fish sanctuaries") ? "sanctuaries" : "other";
      h3 = group = entry = sanct = zw = null;
      continue;
    }
    if (section === "general") { if (tag === "p" || tag === "li") out.general.push(text); continue; }

    if (section === "zoneWide") {
      if (tag === "h3" || tag === "h4") { zw = { species: text, lines: [] }; out.zoneWide.push(zw); }
      else if (zw && (tag === "p" || tag === "li")) { zw.lines.push(text); Object.assign(zw, seasonLimits(zw.lines.join("\n"))); }
      continue;
    }

    if (section === "species") {
      if (tag === "h3") { h3 = text; group = null; }
      else if (tag === "h4") { group = { species: h3, heading: text, waters: [] }; out.speciesExceptions.push(group); }
      else if (tag === "p" && /Season\s*:|Limits\s*:/i.test(text)) {
        if (!group || group.waters.length) { group = { species: h3, heading: "Additional fishing opportunities", waters: [] }; out.speciesExceptions.push(group); }
        Object.assign(group, seasonLimits(text));
      } else if (group && (tag === "li" || tag === "p")) group.waters.push({ ...splitWater(inner, text), text });
      continue;
    }

    if (section === "waterbody") {
      if (tag === "p" && /^\s*<strong>/i.test(inner)) {
        entry = { ...splitWater(inner, text), text, rules: [] };
        out.waterbody.push(entry);
      } else if (entry && tag === "li") entry.rules.push(text);
      else if (entry && tag === "p") entry.rules.push(text);
      continue;
    }

    if (section === "sanctuaries") {
      if (tag === "h3") { sanct = { period: text, waters: [] }; out.sanctuaries.push(sanct); }
      else if (sanct && (tag === "li" || tag === "p")) {
        const w = splitWater(inner, text);
        sanct.waters.push({ ...w, text, seeExceptions: /refer to\s+waterbody exceptions/i.test(text) });
      }
    }
  }
  // Sanity: a real zone page always has zone-wide species seasons.
  if (out.zoneWide.filter((z) => z.season).length < 3) return null;
  return out;
}

// Every passage on a zone page that a link could collide with.
export function zoneCorpus(p) {
  return [
    ...p.general,
    ...p.zoneWide.flatMap((z) => [z.species, ...z.lines]),
    ...p.speciesExceptions.flatMap((g) => [g.species, ...g.waters.map((w) => w.text)]),
    ...p.waterbody.flatMap((e) => [e.text, ...e.rules]),
    ...p.sanctuaries.flatMap((s) => [s.period, ...s.waters.map((w) => w.text)]),
  ];
}

// A deep link that opens the zone page scrolled to (and highlighting) the exact
// text — a URL "text fragment" (Chrome, Edge, Safari 16.1+, Firefox 131+;
// older browsers simply open the page). It quotes the opening words of the
// passage — as many as it takes to be unique on the page (`corpus`) — and its
// closing words, skipping anything in brackets (coordinates, abbreviations)
// whose symbols can render differently from the source and break the match.
export function textFragmentUrl(url, passage, corpus = []) {
  const clean = String(passage || "").replace(/\s+/g, " ").trim();
  if (!clean) return url;
  // Drop bracketed coordinates (digits, °′″); plain-word brackets like
  // "(Oakville Creek)" stay, they render exactly as written.
  const runs = clean.split(/\s*\([^)]*[\d°′″][^)]*\)\s*/).map((r) => r.trim()).filter((r) => r.split(" ").length >= 2);
  if (!runs.length) return url;
  const enc = (s) => encodeURIComponent(s).replace(/-/g, "%2D").replace(/,/g, "%2C").replace(/&/g, "%26");
  const trimEnd = (r) => r.replace(/[\s,;:–-]+$/, "");
  const lower = corpus.map((c) => String(c).replace(/\s+/g, " ").toLowerCase());
  const count = (needle) => { const n = needle.toLowerCase(); let k = 0; for (const c of lower) { let i = c.indexOf(n); while (i >= 0) { k++; i = c.indexOf(n, i + 1); } } return k; };
  const unique = (t) => !lower.length || count(t) <= 1;
  const link = (start, end) => `${url}#:~:text=${enc(start)}${end ? "," + enc(end) : ""}`;

  const first = runs[0].split(" ");
  // Short passage: quote it whole.
  if (runs.length === 1 && first.length <= 16) return link(trimEnd(runs[0]));
  // Opening words: as few as possible (from 8) while unique on the page.
  let k = Math.min(8, first.length), start = trimEnd(first.slice(0, k).join(" "));
  while (!unique(start) && k < first.length) start = trimEnd(first.slice(0, ++k).join(" "));
  if (!unique(start)) {
    // Identical opening to another entry — anchor on a later run that is unique.
    const later = runs.slice(1).map(trimEnd).find((r) => unique(r));
    if (later) return link(later);
  }
  // Closing words, taken after the opening so the two never overlap.
  const lastRun = runs.length > 1 ? trimEnd(runs[runs.length - 1]).split(" ") : first.slice(k);
  const end = lastRun.slice(-6).join(" ");
  return link(start, end && lastRun.length >= 2 ? trimEnd(end) : "");
}
