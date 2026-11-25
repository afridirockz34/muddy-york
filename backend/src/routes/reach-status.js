import fs from "node:fs";
import { fetchWeather as liveWeather } from "../alerts/weather.js";
import { scoreSpot, modelStreamTemp } from "../alerts/score.js";
import { makeSeasonCheck } from "../nurture/welcome.js";
import { label } from "../nurture/run.js";

// Today's read for one river stretch, for its public page: the score, the
// estimated water temperature and flow, the season, and when it was worked
// out. The app has this for every river and spot; a public page shows only
// its own river. A closed stretch gets no score, only conditions.
const RIVERS = JSON.parse(fs.readFileSync(new URL("../data/rivers.json", import.meta.url), "utf8"));
const BY_ID = new Map(RIVERS.map((r) => [r.id, r]));
const TTL = 30 * 60e3;

export default async function reachStatusRoutes(app, { fetchWeather = liveWeather } = {}) {
  const cache = new Map(); // id -> { at, v }
  let season = { at: 0, check: null };
  const seasonCheck = async () => {
    if (!season.check || Date.now() - season.at > 6 * 3600e3) season = { at: Date.now(), check: await makeSeasonCheck(new Date()) };
    return season.check;
  };
  async function statusOf(r) {
    const hit = cache.get(r.id);
    if (hit && Date.now() - hit.at < TTL) return hit.v;
    const now = new Date();
    const w = await fetchWeather(r.lat, r.lon);
    const st = (await seasonCheck())(r);
    const closed = st && st.state === "closed";
    const score = closed ? null : scoreSpot({ habitat: r.habitat, species: r.species, history: r.history }, w, now);
    const v = { id: r.id, river: r.river, section: r.section, score, label: score == null ? null : label(score),
      season: st ? st.state : null, waterC: Math.round(modelStreamTemp(r.habitat.cold, w.airMean)), flow: w.flow,
      rain48mm: w.p48 != null ? Math.round(w.p48) : null, updatedAt: now.toISOString() };
    cache.set(r.id, { at: Date.now(), v });
    return v;
  }
  app.get("/api/reach-status", async (req, reply) => {
    const ids = String(req.query.ids || "").split(",").map((x) => x.trim()).filter((x) => BY_ID.has(x)).slice(0, 6);
    if (!ids.length) return reply.code(400).send({ error: "unknown river" });
    const out = [];
    for (const id of ids) { try { out.push(await statusOf(BY_ID.get(id))); } catch { /* weather unavailable: leave it out */ } }
    if (!out.length) return reply.code(503).send({ error: "conditions unavailable" });
    reply.header("Cache-Control", "public, max-age=900");
    return { reaches: out };
  });
}
