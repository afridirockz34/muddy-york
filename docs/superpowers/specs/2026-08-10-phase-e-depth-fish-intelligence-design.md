# Phase E — Depth & Fish Intelligence (Rivers + Lakes) — Design

**Date:** 2026-08-10
**App:** Muddy York Angling Co.
**Scope:** Backend services + pure model + frontend panel. River-focused.
**Depends on:** Phase-3 proxy (cache + resilient fetch), Phase-4 WSC gauge integration, discovery engine, habitat proxy.

## Purpose

Make the app estimate, from real data, **where the deeper holding water is** and
**what fish (species + size/age) you might catch there** — especially in
**rivers** (this is a river fly-fishing app), and in lakes/ponds where sounded
bathymetry exists. Honest estimates, not predictions; they sharpen as anglers
log catches (Phase B).

## Verified data sources (live, keyless)

- **Ontario LIO "Bathymetry Line"** REST API — real sounded depth contours with a
  `DEPTH` field, bbox-queryable. Endpoint:
  `https://ws.lioservices.lrc.gov.on.ca/arcgis2/rest/services/LIO_OPEN_DATA/LIO_Open01/MapServer/30`.
  Covers 11,000+ lakes/ponds and **some larger river channels** where surveyed.
- **Ontario Fish Stocking (recreational)** — ArcGIS REST layer (Ontario GeoHub):
  species, location, life-stage, stocking date. Exact endpoint pinned in the plan.
- **Water Survey of Canada** real-time hydrometric (Phase 4) — river **stage/level**
  + discharge at gauges.
- **Open-Meteo elevation** (already used) — for river gradient.

## The river-depth reality (why a model, not a dataset)

Comprehensive river bathymetry does not exist as clean open data. Depth in a
river is *local* — a reach alternates riffle / run / pool. So for rivers we
compute a **holding-water model** per reach from morphology signals, and use
LIO bathymetry opportunistically where it covers the channel.

## Components

### 1. Bathymetry service (lakes/ponds) — `backend`
`GET /api/bathymetry?lat&lon` → queries LIO Bathymetry Line in a bbox around the
point, returns `{ maxDepthM, contourCount, deepHole: bool, source:"sounded" }`
(deepest contour = max depth; `deepHole` when max depth exceeds a threshold vs
the local median). Cached 30 days (bathymetry is static). Empty result when no
contours nearby.

### 2. River holding-water model (pure, tested) — `lib`/backend
`holdingWater(reach) => { poolScore, class, deepHole, drivers }` where inputs are
signals we can obtain per reach:
- **Tailwater** below a dam/weir (plunge pool) — strong deep signal (discovery
  already flags `isTailwater`).
- **Confluence proximity** — tributary junctions scour holes (from OSM waterway
  intersections near the reach).
- **Gradient** — elevation drop over the reach length (Open-Meteo elevation at
  two points). Low gradient → slow, deeper pools; steep → riffles.
- **Sinuosity / outer bends** — reach geometry curvature (undercut banks) from
  the OSM polyline.
- **Channel width** — OSM `width`/`waterway` class (river > stream).
- **Below a lake/impoundment** — deeper, more stable flow.
- **WSC stage** (if a gauge is near) — higher stage nudges depth up.
- **LIO bathymetry hit** — if contours cover this river channel, use the measured
  max depth directly (overrides the heuristic).
Output: `poolScore` 0–100, `class ∈ {riffle, run, pool, deep-pool}`, `deepHole`
flag, and `drivers[]` (the reasons, for transparency in the UI).

### 3. Stocking service — `backend`
`GET /api/stocking?lat&lon` → nearest recent stocking events within N km:
`{ events:[{ species, stage, year, yearsAgo, distanceKm }], nearestKm }`. Cached
7 days. Feeds the species + age signal.

### 4. Fish-intelligence model (pure, tested) — `lib`
`estimateFish({ depth, holdingWater, stocking, habitat, waterType, month })` →
`{ species:[{ key, likelihood }], sizeClass, ageEstimate, rationale }`:
- **Species**: from stocking (what's actually stocked here) + existing inference
  (region/water-type) + season activity.
- **Size/age**: deeper holding water + cold retention + older stocking cohorts →
  larger/older fish plausible. E.g. deep cold pool + brown-trout stocking 4 yrs
  ago → "holdover browns, ~3–5 yrs, plausible larger fish." Shallow warm riffle →
  "smaller, younger fish."
- **rationale**: plain-language drivers ("deep tailwater pool", "stocked 4 yrs
  ago", "cold-water hold") — never a false-precision number.
- Confidence is explicit; catch logs (Phase B) later reweight it.

### 5. Enrichment + frontend
- Discovery/curated spots gain an optional depth/fish enrichment (lazy, on spot
  open — not for every marker at once).
- **Spot detail panel** "Depth & likely fish": max depth or holding-water class
  with drivers, a species list with likelihood, and the size/age estimate —
  clearly labelled **Estimate**, with source notes (sounded vs modelled).
- More curated river reaches added to `RIVERS` (research-backed).

## Architecture & data flow

Reuses the Phase-3 backend proxy (resilient fetch + cache). New endpoints:
`/api/bathymetry`, `/api/stocking`. Pure models (`holdingWater`, `estimateFish`)
in `lib/` — imported by the frontend for display and (later) by the backend
alert job. On spot open, the frontend calls the proxy for bathymetry + stocking,
runs the models, and renders the panel. Everything degrades gracefully (missing
data → "no depth data here", model falls back to habitat-only).

## Error handling

- Any ArcGIS/WSC failure → cached or empty block, clear "no data" copy, never a
  crash. Resilient fetch + fallback as in Phase 3.
- No `API_BASE` (standalone) → depth/stocking panel hidden; models still run on
  local signals (holding-water from discovery traits) with lower confidence.

## Testing

- **Pure (Vitest):** `holdingWater` (tailwater/gradient/sinuosity/bathymetry
  precedence), `estimateFish` (deep+recent-stock → older cohort; shallow warm →
  younger), bathymetry parse (max depth from contours), stocking parse
  (years-ago, nearest).
- **Live checks:** `/api/bathymetry` returns real max depth near a known lake;
  `/api/stocking` returns real events near a stocked water.
- **Browser:** the Depth & likely fish panel renders on spot open with real data;
  labelled Estimate; hidden when no data.

## Out of scope

- Satellite-derived bathymetry (unreliable for turbid tree-lined streams; lake
  data is superior where it matters).
- Precise catch prediction (we estimate plausibility, not certainty).
- Per-cast micro-mapping.

## Success criteria

- A spot's detail shows a real **max depth** (lakes/ponds) or a **holding-water
  class with drivers** (rivers), plus a species + size/age **estimate** grounded
  in stocking + depth + habitat.
- River reaches with deep holding water (tailwater pools, confluences, low-
  gradient runs) are flagged as likely to hold bigger fish.
- All data degrades gracefully; nothing is presented as certainty.
