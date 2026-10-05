import { prisma } from "../db.js";
import { getCurrentUser } from "../auth/current-user.js";
import { isAdmin } from "../social/moderation.js";
import { REACH_REGS } from "../../../lib/regs-reaches.js";
import { resolveReach, statusFor } from "../../../lib/regs-status.js";
import { REGS_BASE, textFragmentUrl, zoneCorpus } from "../../../lib/regs-parse.js";
import { currentZones, syncAll, unmatchedMappings, ZONES } from "../regs/sync.js";

// Official Ontario regulations, synced from ontario.ca (see src/regs/sync.js).
export default async function regulationsRoutes(app) {
  // Per-section bundles of the official entries (verbatim text + deep links);
  // the app computes today's status from these.
  app.get("/api/regs/reaches", async (req, reply) => {
    const { zones, rows } = await currentZones();
    if (!rows.length) return reply.code(503).send({ error: "regulations not loaded yet" });
    const reaches = {};
    for (const id of Object.keys(REACH_REGS)) { const b = resolveReach(id, zones); if (b) reaches[id] = b; }
    const used = new Set(Object.values(REACH_REGS).map((r) => r.zone));
    const relevant = rows.filter((r) => used.has(r.zone));
    reply.header("Cache-Control", "public, max-age=900");
    return {
      source: REGS_BASE,
      checkedAt: oldest(relevant.map((r) => r.checkedAt)),
      changedAt: newest(relevant.map((r) => r.fetchedAt)),
      reaches,
    };
  });

  // Today's official status for one section, for the public river pages:
  // /api/regs/status?id=credit-lower&sp=STL,CHN
  app.get("/api/regs/status", async (req, reply) => {
    const id = String(req.query?.id || "");
    if (!REACH_REGS[id]) return reply.code(404).send({ error: "unknown section" });
    const sp = String(req.query?.sp || "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 8);
    const { zones, rows } = await currentZones();
    const b = resolveReach(id, zones);
    const s = b && statusFor(b, sp.length ? sp : speciesHint(), new Date());
    if (!s) return reply.code(503).send({ error: "regulations not loaded yet" });
    reply.header("Cache-Control", "public, max-age=900");
    return {
      state: s.state, label: s.label, tone: s.tone, zone: s.zone,
      stretches: s.stretches.map((st) => ({ label: st.label, state: st.state, stateLabel: st.stateLabel })),
      checkedAt: oldest(rows.filter((r) => r.zone === b.zone).map((r) => r.checkedAt)),
    };
  });

  // Official entries naming a water, across every zone — for spots the app
  // discovers on the fly (not in the curated list).
  app.get("/api/regs/lookup", async (req, reply) => {
    const name = String(req.query?.name || "").trim();
    if (name.length < 3) return reply.code(400).send({ error: "name required" });
    // Whole-name match ("Humber River" must not pick up "Humberstone Lake").
    const re = new RegExp(`(^|[^a-z])${name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z])`);
    const { zones } = await currentZones();
    const hits = [];
    const push = (zone, kind, text, extra) => hits.push({ zone, kind, text, link: textFragmentUrl(zones[zone].url, text, zoneCorpus(zones[zone])), ...extra });
    for (const [z, p] of Object.entries(zones)) {
      const hit = (t) => re.test(t.toLowerCase());
      p.speciesExceptions.forEach((g) => g.waters.forEach((w) => { if (hit(w.text)) push(z, "spx", w.text, { species: g.species, season: g.season || null }); }));
      p.waterbody.forEach((e) => { if (hit(e.text)) push(z, "wb", e.text, { rules: e.rules }); });
      p.sanctuaries.forEach((s) => s.waters.forEach((w) => { if (!w.seeExceptions && hit(w.text)) push(z, "sanct", w.text, { period: s.period }); }));
    }
    reply.header("Cache-Control", "public, max-age=900");
    return { name, entries: hits.slice(0, 40) };
  });

  // Legacy shape for app versions still in the wild: one state per section,
  // now computed from the official data instead of the old hand-written file.
  app.get("/api/regulations", async () => {
    const { zones, rows } = await currentZones();
    if (!rows.length) return {};
    const reaches = {};
    const now = new Date();
    for (const id of Object.keys(REACH_REGS)) {
      const b = resolveReach(id, zones);
      const s = b && statusFor(b, speciesHint(), now);
      if (!s) continue;
      const state = s.state === "open" || s.state === "closed" ? s.state : "check";
      reaches[id] = { state, detail: s.stretches.map((st) => `${st.label}: ${st.stateLabel}`).join(" · ") + " — see the official entries for this water." };
    }
    return { version: "official-sync", regsUrl: REGS_BASE, updatedAt: oldest(rows.map((r) => r.checkedAt)), reaches };
  });

  // Admin: sync health, recent changes, and sections needing review.
  app.get("/api/admin/regs", async (req, reply) => {
    if (!isAdmin(await getCurrentUser(req))) return reply.code(403).send({ error: "forbidden" });
    const { zones, rows } = await currentZones();
    const changes = await prisma.regsChange.findMany({ orderBy: { detectedAt: "desc" }, take: 20 });
    return {
      zones: ZONES.map((z) => { const r = rows.find((x) => x.zone === z);
        return r ? { zone: z, url: r.url, checkedAt: r.checkedAt, changedAt: r.fetchedAt, lastError: r.lastError, failedAt: r.failedAt } : { zone: z, missing: true }; }),
      changes,
      unmatched: unmatchedMappings(zones),
    };
  });
  app.post("/api/admin/regs/sync", async (req, reply) => {
    if (!isAdmin(await getCurrentUser(req))) return reply.code(403).send({ error: "forbidden" });
    const r = await syncAll({ notify: true });
    return { checked: r.checked, changed: r.changed.map((c) => ({ zone: c.zone, added: c.added.length, removed: c.removed.length })), failed: r.failed, unmatched: r.unmatched };
  });
}

// The legacy endpoint has no species list, so judge by the species the
// section's stretches are about: trout and salmon.
const speciesHint = () => ["STL", "BNT", "BKT", "CHN", "ATS"];
const oldest = (ds) => (ds.length ? new Date(Math.min(...ds.map((d) => +new Date(d)))).toISOString() : null);
const newest = (ds) => (ds.length ? new Date(Math.max(...ds.map((d) => +new Date(d)))).toISOString() : null);
