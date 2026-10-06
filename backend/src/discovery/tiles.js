import { prisma } from "../db.js";
import { resilientFetch } from "../proxy/resilient-fetch.js";
import { OVERPASS_HOSTS } from "../proxy/hosts.js";
import { buildTileQuery, tileCandidates, tilesFor, selectSpots, TILE } from "../../../lib/discovery.js";

// Scouting from shared tiles (see lib/discovery.js). Each 0.25° tile's candidate
// spots are stored in MapDataCache as `tile1:i:j`. Rivers barely change, so a
// tile is good for 30 days and an older copy is still served when Overpass is
// down. A background warmer fills Southern Ontario a tile at a time, so most
// scouts never wait on Overpass at all.
const DAY = 864e5;
export const TILE_TTL = 30 * DAY;
const key = (t) => `tile1:${t.i}:${t.j}`;
const mem = new Map(); // key -> { spots, at }, small LRU in front of Postgres
const remember = (k, v) => { mem.delete(k); mem.set(k, v); if (mem.size > 400) mem.delete(mem.keys().next().value); };

export async function readTile(t) {
  const k = key(t);
  if (mem.has(k)) return mem.get(k);
  const row = await prisma.mapDataCache.findUnique({ where: { key: k } }).catch(() => null);
  if (!row) return null;
  const v = { spots: row.data.spots || [], at: new Date(row.fetchedAt).getTime() };
  remember(k, v);
  return v;
}

export async function fetchTile(t, { fetchImpl = resilientFetch, timeoutMs = 30000, hosts = OVERPASS_HOSTS } = {}) {
  const res = await fetchImpl(hosts,
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "data=" + encodeURIComponent(buildTileQuery(t)) },
    { retries: 0, timeoutMs });
  const json = await res.json();
  if (!json || !Array.isArray(json.elements)) throw new Error("bad overpass payload");
  const spots = tileCandidates(json, t);
  const at = Date.now();
  await prisma.mapDataCache.upsert({ where: { key: key(t) }, create: { key: key(t), data: { spots }, fetchedAt: new Date(at) },
    update: { data: { spots }, fetchedAt: new Date(at) } }).catch(() => {});
  remember(key(t), { spots, at });
  return { spots, at };
}

// Spots for a scout. Stored tiles are used as they are; missing tiles nearest
// the angler are fetched live within a time budget. If some are still missing
// the answer is marked partial (the warmer fills them in later).
export async function discoverSpots(loc, radiusM, { fetchImpl, budgetMs = 22000, liveMax = 2 } = {}) {
  const tiles = tilesFor(loc, radiusM);
  const got = await Promise.all(tiles.map((t) => readTile(t)));
  // The nearest missing tiles are fetched now, in parallel, from the two most
  // reliable servers, and never longer than the budget. The rest are queued.
  const missing = tiles.map((t, k) => (got[k] ? null : k)).filter((k) => k != null);
  await Promise.all(missing.slice(0, liveMax).map(async (k) => {
    try { got[k] = await fetchTile(tiles[k], { fetchImpl, timeoutMs: budgetMs / 2, hosts: OVERPASS_HOSTS.slice(0, 2) }); } catch { got[k] = null; }
  }));
  const cands = [];
  let stillMissing = 0;
  tiles.forEach((t, k) => {
    const v = got[k];
    if (!v) { stillMissing++; queueTile(t); return; }
    if (Date.now() - v.at > TILE_TTL) queueTile(t);
    cands.push(...v.spots);
  });
  return { spots: selectSpots(cands, loc, radiusM), tiles: tiles.length, missing: stillMissing, partial: stillMissing > 0 };
}

// ── background warmer ──
// Southern Ontario's trout and salmon country, plus anything anglers asked for.
const REGION = { s: 42.0, n: 45.5, w: -83.0, e: -76.0 };
const queue = [];
export function queueTile(t) { if (!queue.some((q) => q.i === t.i && q.j === t.j)) queue.push({ i: t.i, j: t.j }); }
export function regionTiles() {
  const out = [];
  for (let i = Math.floor(REGION.s / TILE); i < Math.ceil(REGION.n / TILE); i++)
    for (let j = Math.floor(REGION.w / TILE); j < Math.ceil(REGION.e / TILE); j++) out.push({ i, j });
  // Fill outward from Toronto, where most anglers are.
  const c = { i: 43.7 / TILE, j: -79.4 / TILE };
  return out.sort((a, b) => Math.hypot(a.i - c.i, a.j - c.j) - Math.hypot(b.i - c.i, b.j - c.j));
}

export function scheduleTileWarmer(log = console, { everyMs = 90_000 } = {}) {
  let busy = false, region = null, idx = 0;
  const tick = async () => {
    if (busy) return; busy = true;
    try {
      let t = queue.shift();
      if (!t) {
        region = region || regionTiles();
        for (let n = 0; n < region.length && !t; n++) {
          const c = region[idx++ % region.length];
          const v = await readTile(c);
          if (!v || Date.now() - v.at > TILE_TTL * 0.8) t = c;
        }
      }
      if (t) { const v = await fetchTile(t); log.info?.({ tile: t, spots: v.spots.length }, "discovery tile warmed"); }
    } catch (e) { log.warn?.({ err: e && e.message }, "discovery tile warm failed"); }
    finally { busy = false; }
  };
  setTimeout(tick, 120_000);
  return setInterval(tick, everyMs);
}
