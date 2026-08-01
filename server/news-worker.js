/**
 * Muddy York — News & Conditions aggregator (Cloudflare Worker)
 * GET /news  ->  JSON array of items the app's News tab understands:
 *   { title, summary, category, source, url, published }
 *
 * Why this exists: browsers block cross-origin RSS/Atom feeds (CORS), so the
 * external Reports / Events / Regulations / Alerts can't be pulled by the PWA
 * directly. This Worker fetches them server-side, classifies and dedupes, caches
 * the result, and serves it with an open CORS header. Deploy it once, then paste
 * its URL into the app (News tab -> Connect a source). See server/README.md.
 *
 * NOTE: confirm the feed URLs below — conservation authorities and government
 * sites change them. Add or remove sources freely.
 */

const FEEDS = [
  // --- Government / alerts ---
  { url: "https://weather.gc.ca/rss/warning/on-31_e.xml", category: "Weather", source: "Environment Canada" }, // example region; swap for your area
  // --- Conservation authorities (reports / closures / stocking) ---
  { url: "https://cvc.ca/feed/",            category: "Reports",     source: "Credit Valley CA" },
  { url: "https://trca.ca/feed/",           category: "Reports",     source: "TRCA" },
  { url: "https://www.nvca.on.ca/feed",     category: "Reports",     source: "Nottawasaga Valley CA" },
  // --- Regulations / fisheries ---
  { url: "https://news.ontario.ca/mnrf/en/rss.xml", category: "Regulations", source: "Ontario MNRF" },
];

const CACHE_TTL = 1800; // seconds (30 min)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    const url = new URL(request.url);
    if (!url.pathname.endsWith("/news")) return new Response("Not found", { status: 404, headers: CORS });

    const cache = caches.default;
    const cacheKey = new Request(url.toString(), request);
    const hit = await cache.match(cacheKey);
    if (hit) return hit;

    const lists = await Promise.all(FEEDS.map((f) => pullFeed(f).catch(() => [])));
    let items = lists.flat();

    // dedupe by url|title, sort newest first, cap
    const seen = new Set();
    items = items.filter((i) => {
      const k = (i.url || "") + "|" + i.title;
      if (seen.has(k)) return false; seen.add(k); return true;
    });
    items.sort((a, b) => (Date.parse(b.published || 0) || 0) - (Date.parse(a.published || 0) || 0));
    items = items.slice(0, 60);

    const res = new Response(JSON.stringify(items), {
      headers: { "Content-Type": "application/json", "Cache-Control": `max-age=${CACHE_TTL}`, ...CORS },
    });
    ctx.waitUntil(cache.put(cacheKey, res.clone()));
    return res;
  },
};

async function pullFeed(feed) {
  const r = await fetch(feed.url, { headers: { "User-Agent": "MuddyYork/1.0 (+news aggregator)" }, cf: { cacheTtl: 900 } });
  if (!r.ok) return [];
  const xml = await r.text();
  const raw = parseFeed(xml);
  return raw.map((e) => ({
    title: e.title,
    summary: clean(e.summary).slice(0, 280),
    category: classify(feed.category, e.title + " " + e.summary),
    source: feed.source,
    url: e.link,
    published: e.published,
  })).filter((i) => i.title);
}

// Minimal RSS + Atom parser (no deps)
function parseFeed(xml) {
  const out = [];
  const blocks = xml.match(/<(item|entry)[\s\S]*?<\/(item|entry)>/g) || [];
  for (const b of blocks) {
    out.push({
      title: clean(tag(b, "title")),
      link: attr(b, "link", "href") || tag(b, "link") || tag(b, "guid"),
      summary: tag(b, "description") || tag(b, "summary") || tag(b, "content"),
      published: tag(b, "pubDate") || tag(b, "updated") || tag(b, "published") || "",
    });
  }
  return out;
}
function tag(s, name) {
  const m = s.match(new RegExp("<" + name + "[^>]*>([\\s\\S]*?)<\\/" + name + ">", "i"));
  return m ? m[1].trim() : "";
}
function attr(s, name, a) {
  const m = s.match(new RegExp("<" + name + "[^>]*\\b" + a + "=\"([^\"]+)\"", "i"));
  return m ? m[1] : "";
}
function clean(s) {
  return (s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/\s+/g, " ").trim();
}
function classify(fallback, text) {
  const t = text.toLowerCase();
  if (/regulation|closure|closed|licen|season (opens|closes)|sanctuary/.test(t)) return "Regulations";
  if (/stock|stocked|catch|caught|report|hatchery/.test(t)) return "Reports";
  if (/tournament|derby|event|cleanup|community|volunteer/.test(t)) return "Events";
  if (/flood|warning|advisory|storm|rain|wind|watch/.test(t)) return "Weather";
  if (/flow|water level|reservoir|release|drought|turbid/.test(t)) return "Water";
  return fallback;
}
