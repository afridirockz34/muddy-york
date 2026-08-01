/**
 * Muddy York — News & Conditions aggregator (Netlify Function, v2 API)
 * Endpoint after deploy:  https://<your-site>.netlify.app/news
 *
 * Same job as the Cloudflare worker: fetch RSS/Atom feeds server-side (browsers
 * can't, due to CORS), classify + dedupe, and return the JSON the app's News tab
 * expects. Deploy with the Netlify CLI or Git (NOT browser drag-and-drop — that
 * skips the build step that bundles functions). See server/README.md.
 *
 * Confirm the FEEDS URLs — authority/government feed addresses drift.
 */

export const config = { path: "/news" }; // routes this function to /news

const FEEDS = [
  { url: "https://weather.gc.ca/rss/warning/on-31_e.xml", category: "Weather", source: "Environment Canada" }, // example region; swap for yours
  { url: "https://cvc.ca/feed/",            category: "Reports",     source: "Credit Valley CA" },
  { url: "https://trca.ca/feed/",           category: "Reports",     source: "TRCA" },
  { url: "https://www.nvca.on.ca/feed",     category: "Reports",     source: "Nottawasaga Valley CA" },
  { url: "https://news.ontario.ca/mnrf/en/rss.xml", category: "Regulations", source: "Ontario MNRF" },
];

const CACHE_TTL = 1800; // seconds
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const lists = await Promise.all(FEEDS.map((f) => pullFeed(f).catch(() => [])));
  let items = lists.flat();

  const seen = new Set();
  items = items.filter((i) => {
    const k = (i.url || "") + "|" + i.title;
    if (seen.has(k)) return false; seen.add(k); return true;
  });
  items.sort((a, b) => (Date.parse(b.published || 0) || 0) - (Date.parse(a.published || 0) || 0));
  items = items.slice(0, 60);

  return new Response(JSON.stringify(items), {
    headers: {
      "Content-Type": "application/json",
      "Netlify-CDN-Cache-Control": `public, durable, max-age=${CACHE_TTL}`,
      "Cache-Control": "public, max-age=300",
      ...CORS,
    },
  });
};

async function pullFeed(feed) {
  const r = await fetch(feed.url, { headers: { "User-Agent": "MuddyYork/1.0 (+news aggregator)" } });
  if (!r.ok) return [];
  const xml = await r.text();
  return parseFeed(xml).map((e) => ({
    title: e.title,
    summary: clean(e.summary).slice(0, 280),
    category: classify(feed.category, e.title + " " + e.summary),
    source: feed.source,
    url: e.link,
    published: e.published,
  })).filter((i) => i.title);
}

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
