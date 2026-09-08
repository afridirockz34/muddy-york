// Ontario fishing-season knowledge for the reach cards.
//
// IMPORTANT: There is no official real-time Ontario regulations API. This encodes
// the GENERAL open-season rules from the published Ontario Fishing Regulations
// Summary, plus optional per-reach overrides. It is guidance, not legal advice —
// water-specific exceptions and sanctuary closures override the zone defaults,
// which is why anything uncertain resolves to "check" (never a false "open").
//
// The data below is the bundled offline fallback; the app fetches an updatable
// copy from GET /api/regulations and merges it over this, so seasons can be
// refreshed centrally without an app release.

export const DEFAULT_REGS = {
  version: "bundled",
  regsUrl: "https://www.ontario.ca/document/ontario-fishing-regulations-summary",
  updatedAt: null,
  // Per-reach overrides keyed by river id — the most accurate layer. Each value is
  // { detail, and either state:"open"|"closed"|"check" OR group:"<groups key>" }.
  // A `group` is date-aware (computes open/closed from that group's window).
  // These are encoded from the FMZ 16 regulations (ontario.ca) for our reaches;
  // the backend feed can add/refine more.
  reaches: {
    // ── Extended fall migratory season (open ~4th Sat April → Dec 31) ──
    "grand-lower": { group: "extendedFall", detail: "Grand River below Paris — extended migratory season to Dec 31 (rainbow, brown, Pacific & Atlantic salmon). Lower-river limits apply Oct 1–Dec 31." },
    "credit-lower": { group: "extendedFall", detail: "Lower Credit (Britannia Rd to Hwy 407) — extended fall migratory season to Dec 31. Atlantic salmon are catch-and-release only." },
    "humber-lower": { group: "extendedFall", detail: "Lower Humber (Eglinton Ave to Hwy 407) — extended fall migratory season to Dec 31." },
    "rouge-lower": { group: "extendedFall", detail: "Rouge River — extended fall migratory season to Dec 31." },
    "bronte": { group: "extendedFall", detail: "Bronte Creek (Lakeshore to Hwy 407, Oakville) — extended fall migratory season to Dec 31." },
    "sixteen": { group: "extendedFall", detail: "Sixteen Mile Creek (Oakville) — extended fall migratory season to Dec 31." },
    "notty-main": { group: "extendedFall", detail: "Nottawasaga River main stem — extended fall migratory season to Dec 31 (rainbow, brown, Pacific & Atlantic salmon)." },
    // ── Resident-trout season only (closes Sept 30) ──
    "grand-tw": { group: "streamTrout", detail: "Grand tailwater above Paris — resident-trout season (~4th Sat April to Sept 30). Above Paris: artificial lures only, single barbless hook, catch-and-release for brown & rainbow." },
    "credit-upper": { group: "streamTrout", detail: "Upper Credit — resident-trout season (~4th Sat April to Sept 30). Above Britannia Rd is a fish sanctuary: no fishing Jan 1 to the Friday before the 4th Sat in April." },
    "credit-mid": { group: "streamTrout", detail: "Middle Credit (Norval–Glen Williams), above the Hwy 407 extended-season boundary — resident-trout season closes Sept 30. Confirm the exact reach in the regs." },
    "notty-tribs": { group: "streamTrout", detail: "Nottawasaga cold tributaries — resident-trout season (~4th Sat April to Sept 30). The extended fall season applies to the main river, not these headwater tribs." },
    "boyne": { group: "streamTrout", detail: "Boyne headwaters — resident-trout season (~4th Sat April to Sept 30)." },
    "conestogo-tw": { group: "streamTrout", detail: "Conestogo tailwater — resident-trout season (~4th Sat April to Sept 30). Not on the extended-fall list." },
  },
  // Fallback rules by species group.
  groups: {
    // Resident stream trout: classic Ontario stream-trout season, ~4th Saturday
    // of April through September 30 in the Southern divisions.
    streamTrout: { mode: "window", openRule: "4thSatApril", close: [9, 30] },
    // Extended fall season on named Great Lakes migratory rivers (to Dec 31).
    extendedFall: { mode: "window", openRule: "4thSatApril", close: [12, 31], note: "Extended fall migratory season (to Dec 31) on this named river." },
    // Migratory fish and salmon on unnamed Great Lakes tribs are heavily
    // water-specific (extended seasons, spring sanctuary closures) — defer.
    migratoryTrout: { mode: "check" },
    salmon: { mode: "check" },
    atlantic: { mode: "check", note: "Atlantic salmon are a restoration fishery — often catch-and-release only or closed. Confirm before fishing." },
    laketrout: { mode: "check" },
    bass: { mode: "window", openRule: "4thSatJune", close: [11, 30] },
    default: { mode: "check" },
  },
};

const SPECIES_GROUP = {
  BKT: "streamTrout", BNT: "streamTrout",
  RBT: "migratoryTrout", STL: "migratoryTrout", BNTr: "migratoryTrout",
  CHN: "salmon", COH: "salmon",
  ATS: "atlantic", LAT: "laketrout",
  SMB: "bass", NP: "default", WAL: "default", PAN: "default",
};

const LABEL = { open: "In season", closed: "Closed now", check: "Check regs" };
const TONE = { open: "green", closed: "red", check: "amber" };

// nth given weekday (0=Sun..6=Sat) of a month (month0 = 0-indexed).
function nthWeekday(year, month0, weekday, n) {
  const first = new Date(year, month0, 1);
  const day = 1 + ((weekday - first.getDay() + 7) % 7) + (n - 1) * 7;
  return new Date(year, month0, day);
}

function openRuleStart(rule, year) {
  if (rule === "4thSatApril") return nthWeekday(year, 3, 6, 4);
  if (rule === "4thSatJune") return nthWeekday(year, 5, 6, 4);
  return null;
}

// Compute a state from a single rule on a date. Returns "open"|"closed"|"check".
function stateFromRule(rule, date) {
  if (!rule || rule.mode === "check") return "check";
  if (rule.mode === "closed") return "closed";
  if (rule.mode === "window") {
    const y = date.getFullYear();
    const start = openRuleStart(rule.openRule, y);
    if (!start) return "check";
    const end = new Date(y, (rule.close[0] - 1), rule.close[1], 23, 59, 59);
    return date >= start && date <= end ? "open" : "closed";
  }
  return "check";
}
const groupRule = (regs, group) => (regs.groups && regs.groups[group]) || DEFAULT_REGS.groups[group] || DEFAULT_REGS.groups.default;

// Status for one species on a date under a set of rules.
function speciesState(sp, date, regs) {
  return stateFromRule(groupRule(regs, SPECIES_GROUP[sp] || "default"), date);
}

// Resolve a per-reach override to a state (supports a static `state` OR a
// date-aware `group` that references a rule in regs.groups).
function overrideState(ov, date, regs) {
  if (!ov) return null;
  if (ov.state) return ov.state;
  if (ov.group) return stateFromRule(groupRule(regs, ov.group), date);
  return null;
}

// Primary entry point. reach = { id, zone, species:[...] }.
// Returns { state, label, tone, detail, regsUrl }.
export function reachRegStatus(reach, date = new Date(), regs = DEFAULT_REGS) {
  const regsUrl = regs.regsUrl || DEFAULT_REGS.regsUrl;
  const pack = (state, detail) => ({ state, label: LABEL[state], tone: TONE[state], detail, regsUrl });
  if (!reach) return pack("check", "Confirm the current Ontario fishing regulations for this water.");

  // 1) Per-reach override wins (most specific / confirmed regulation).
  const ov = regs.reaches && regs.reaches[reach.id];
  const ovs = overrideState(ov, date, regs);
  if (ovs) return pack(ovs, (ov && ov.detail) || defaultDetail(ovs, regs, reach.zone));

  // 2) Messy/multi-zone or explicitly flagged zones always defer.
  const zone = reach.zone || "";
  if (/exception/i.test(zone) || zone.includes("/")) {
    return pack("check", `${zone.replace(/\s*—.*$/, "")} has water-specific exceptions — confirm this reach in the current regs.`);
  }

  // 3) Roll up across the reach's target species.
  const species = Array.isArray(reach.species) && reach.species.length ? reach.species : [];
  if (!species.length) return pack("check", "Confirm the current Ontario fishing regulations for this water.");
  const states = species.map((sp) => speciesState(sp, date, regs));
  let state;
  if (states.every((s) => s === "closed")) state = "closed";
  else if (states.every((s) => s === "open")) state = "open";
  else state = "check";
  return pack(state, defaultDetail(state, regs, zone));
}

function defaultDetail(state, regs, zone) {
  const z = zone ? `${zone}: ` : "";
  if (state === "open") return `${z}within the general open season. Always confirm this water's specific exceptions and limits in the current Ontario regs.`;
  if (state === "closed") return `${z}outside the general open season for the resident trout here. Some migratory seasons differ — confirm in the current regs.`;
  return `${z}season varies by water (migratory runs, sanctuary closures). Confirm this reach in the current Ontario regs before fishing.`;
}

// Per-species breakdown for a reach, for the in-app detail sheet. Honors the
// per-reach override and the zone-exception rule, same as reachRegStatus.
export function reachSpeciesStates(reach, date = new Date(), regs = DEFAULT_REGS) {
  const species = Array.isArray(reach && reach.species) ? reach.species : [];
  const zone = (reach && reach.zone) || "";
  const forceCheck = /exception/i.test(zone) || zone.includes("/");
  const ov = regs.reaches && reach && regs.reaches[reach.id];
  const ovRule = ov && ov.group ? groupRule(regs, ov.group) : null;
  return species.map((sp) => {
    const state = ov && ov.state ? ov.state
      : ovRule ? stateFromRule(ovRule, date)
      : (forceCheck ? "check" : speciesState(sp, date, regs));
    const rule = ovRule || groupRule(regs, SPECIES_GROUP[sp] || "default");
    let window = null;
    if (rule && rule.mode === "window") {
      const start = openRuleStart(rule.openRule, date.getFullYear());
      const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      if (start) window = `${months[start.getMonth()]} ${start.getDate()} – ${months[rule.close[0]-1]} ${rule.close[1]}`;
    }
    return { key: sp, state, label: LABEL[state], tone: TONE[state], window, note: rule && rule.note ? rule.note : null };
  });
}

// Merge a backend-served regs object over the bundled default (shallow, safe).
export function mergeRegs(remote) {
  if (!remote || typeof remote !== "object") return DEFAULT_REGS;
  return {
    ...DEFAULT_REGS,
    ...remote,
    groups: { ...DEFAULT_REGS.groups, ...(remote.groups || {}) },
    reaches: { ...(DEFAULT_REGS.reaches || {}), ...(remote.reaches || {}) },
  };
}
