import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { sendMail } from "../alerts/mailer.js";
import { parseZonePage, zoneUrl } from "../../../lib/regs-parse.js";
import { resolveReach } from "../../../lib/regs-status.js";
import { REACH_REGS } from "../../../lib/regs-reaches.js";

export const ZONES = Array.from({ length: 20 }, (_, i) => i + 1);
const SNAPSHOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data", "regs-zones.json");
const UA = "MuddyYorkFishing/1.0 (regulations sync; info@muddyyorkfishing.ca)";

let lastAlertKey = null;
const hashOf = (data) => createHash("sha256").update(JSON.stringify(data)).digest("hex");

// Every rule as one line of text, so two versions can be compared line by line.
export function flatten(p) {
  const out = [];
  p.zoneWide.forEach((z) => out.push(`Zone-wide · ${z.species}: ${[z.season && "Season: " + z.season, z.limits && "Limits: " + z.limits].filter(Boolean).join(" · ")}`));
  p.speciesExceptions.forEach((g) => g.waters.forEach((w) => out.push(`Species exception · ${g.species} (${g.season || "see page"}): ${w.text}`)));
  p.waterbody.forEach((e) => (e.rules.length ? e.rules : [""]).forEach((r) => out.push(`Waterbody exception · ${e.text}${r ? " → " + r : ""}`)));
  p.sanctuaries.forEach((s) => s.waters.forEach((w) => out.push(`Sanctuary · ${s.period}: ${w.text}`)));
  return out;
}
export function diff(oldP, newP) {
  const a = new Set(flatten(oldP)), b = new Set(flatten(newP));
  return { added: [...b].filter((x) => !a.has(x)), removed: [...a].filter((x) => !b.has(x)) };
}

// Load the parsed zones currently in effect: { [zone]: parsed }.
export async function currentZones() {
  const rows = await prisma.regsZone.findMany();
  const zones = {};
  rows.forEach((r) => { zones[r.zone] = r.data; });
  return { zones, rows };
}

// First boot: seed from the snapshot shipped with the code, so the app has
// official data before the first live check finishes.
export async function seedIfEmpty() {
  if ((await prisma.regsZone.count()) > 0) return false;
  const snap = JSON.parse(await readFile(SNAPSHOT, "utf8"));
  const at = new Date(snap.fetchedAt);
  for (const [zone, data] of Object.entries(snap.zones)) {
    await prisma.regsZone.create({ data: { zone: +zone, url: data.url, hash: hashOf(data), data, fetchedAt: at, checkedAt: at } });
  }
  return true;
}

// Mappings that no longer find their official entry (Ontario reworded or
// removed it) — these show "Check regs" in the app until someone reviews them.
export function unmatchedMappings(zones) {
  const out = [];
  for (const id of Object.keys(REACH_REGS)) {
    const b = resolveReach(id, zones);
    if (!b) { out.push({ id, stretch: "(whole section)", spec: "zone page missing" }); continue; }
    b.stretches.forEach((st) => st.unmatched.forEach((spec) => out.push({ id, stretch: st.label, spec: `${spec.kind} "${spec.name}" with ${JSON.stringify(spec.has || [])}` })));
  }
  return out;
}

// Fetch, parse and store every zone page. Unchanged pages just get a fresh
// checkedAt; changed pages are stored and logged; a page that fails to load or
// parse keeps its last good copy and records the error. Emails the admin when
// anything changes, breaks, or a mapping stops matching.
export async function syncAll({ fetchImpl = fetch, notify = true, pauseMs = 400, log = () => {} } = {}) {
  const now = new Date();
  const report = { checked: 0, changed: [], failed: [], unmatched: [] };
  const existing = Object.fromEntries((await prisma.regsZone.findMany()).map((r) => [r.zone, r]));
  for (const zone of ZONES) {
    const url = zoneUrl(zone);
    try {
      const res = await fetchImpl(url, { headers: { "User-Agent": UA, Accept: "text/html" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const parsed = parseZonePage(await res.text(), zone);
      if (!parsed) throw new Error("page layout not recognised — kept the last good copy");
      const hash = hashOf(parsed), prev = existing[zone];
      if (!prev) {
        await prisma.regsZone.create({ data: { zone, url, hash, data: parsed, fetchedAt: now, checkedAt: now } });
      } else if (prev.hash !== hash) {
        const d = diff(prev.data, parsed);
        await prisma.regsZone.update({ where: { zone }, data: { hash, data: parsed, fetchedAt: now, checkedAt: now, lastError: null, failedAt: null } });
        await prisma.regsChange.create({ data: { zone, added: d.added, removed: d.removed } });
        report.changed.push({ zone, ...d });
      } else {
        await prisma.regsZone.update({ where: { zone }, data: { checkedAt: now, lastError: null, failedAt: null } });
      }
      report.checked++;
    } catch (e) {
      const msg = String(e && e.message || e).slice(0, 300);
      report.failed.push({ zone, error: msg });
      if (existing[zone]) await prisma.regsZone.update({ where: { zone }, data: { lastError: msg, failedAt: now } }).catch(() => {});
    }
    if (pauseMs) await new Promise((r) => setTimeout(r, pauseMs)); // be polite to ontario.ca
  }
  report.unmatched = unmatchedMappings((await currentZones()).zones);
  log(report);
  // Changes always alert; ongoing failures / unmatched sections only alert when
  // the set differs from the last alert (not twice a day forever).
  const key = JSON.stringify([report.failed.map((f) => f.zone), report.unmatched.map((u) => u.id + u.stretch)]);
  const fresh = (report.failed.length || report.unmatched.length) && key !== lastAlertKey;
  if (notify && (report.changed.length || fresh)) { await emailReport(report).catch(() => {}); lastAlertKey = key; }
  return report;
}

async function emailReport(r) {
  if (!config.resend.adminEmail) return;
  const lines = [];
  if (r.changed.length) {
    lines.push(`Ontario changed ${r.changed.length} zone page(s). The app now uses the new official text.`, "");
    for (const c of r.changed) {
      lines.push(`Zone ${c.zone} — ${zoneUrl(c.zone)}`);
      c.added.slice(0, 25).forEach((x) => lines.push(`  + ${x}`));
      c.removed.slice(0, 25).forEach((x) => lines.push(`  − ${x}`));
      if (c.added.length + c.removed.length > 50) lines.push("  … (more in the admin dashboard)");
      lines.push("");
    }
  }
  if (r.unmatched.length) {
    lines.push("These river sections no longer match an official entry and now show \"Check regs\" — review lib/regs-reaches.js:");
    r.unmatched.forEach((u) => lines.push(`  • ${u.id} / ${u.stretch}: ${u.spec}`));
    lines.push("");
  }
  if (r.failed.length) {
    lines.push("Couldn't check these zones (the app keeps the last good copy):");
    r.failed.forEach((f) => lines.push(`  • Zone ${f.zone}: ${f.error}`));
  }
  const subject = r.changed.length ? `Ontario fishing regs changed (${r.changed.map((c) => "Zone " + c.zone).join(", ")})`
    : r.unmatched.length ? "Regs check: river sections need review" : "Regs check: some zones couldn't be read";
  await sendMail({ to: config.resend.adminEmail, subject: `[Muddy York] ${subject}`, text: lines.join("\n") });
}

// Twice a day, starting shortly after boot. Skipped in tests.
export function scheduleRegsSync(log = console) {
  const run = () => syncAll({ log: (r) => log.info?.({ regs: { checked: r.checked, changed: r.changed.map((c) => c.zone), failed: r.failed.length, unmatched: r.unmatched.length } }, "regs sync") })
    .catch((e) => log.error?.({ err: e }, "regs sync failed"));
  seedIfEmpty().catch((e) => log.error?.({ err: e }, "regs seed failed")).finally(() => setTimeout(run, 30_000));
  return setInterval(run, 12 * 60 * 60 * 1000);
}
