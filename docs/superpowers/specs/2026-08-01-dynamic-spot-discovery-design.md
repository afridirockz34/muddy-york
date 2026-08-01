# Dynamic Spot Discovery — Design

**Date:** 2026-08-01
**App:** Muddy York Angling Co. (River Intel PWA)
**Author:** design session

## Problem

The app scores only 16 hand-authored river reaches clustered ~2 hours around
Toronto (the `RIVERS` array in `source-app.jsx`). When the angler travels
anywhere else, the app has nothing to show — it feels fixed to specific places.

The goal: **find fishable water ~2 hours around the angler wherever they are**,
while keeping the deep, curated intelligence the app already has, adding
parking + hiking routes to reach the water, Google Maps hand-off, and a more
reliable, friendlier interface.

## Core tension

The app's intelligence is hand-curated. Each of the 16 reaches carries
expert-tuned habitat numbers (`cold`, `hold`, `struct`, `ox`, `spawn`, `gw`,
`history`, `conf`) and a written note. A river discovered near an arbitrary
location has none of that. "Discover anywhere" and "curated intelligence" pull
against each other. This design resolves it with a **hybrid**: keep the 16
curated reaches as a premium "Verified water" layer, and auto-discover
additional spots scored by a derived proxy at lower confidence, so verified
water naturally outranks discovered water when nearby.

## Decisions (locked in brainstorming)

- **Discovery approach:** Hybrid. Curated reaches + auto-discovered spots.
- **What counts as a spot:** Access-tagged water **plus named river/stream
  reaches**. Exclude unnamed tiny creeks and ponds.
- **Geographic range:** Ontario / Great Lakes. Species model stays; likely
  species inferred per discovered spot from region + water type. Warmwater
  species added (smallmouth bass, northern pike, walleye, panfish).
- **Presentation:** One unified ranked list. Each spot badged "Verified water"
  vs "Auto-discovered"; discovered spots carry lower confidence.
- **Deploy:** Netlify Drop (static hosting). Build produces the same static
  folder. No hosting change.

## Architecture approach

**Client-first, with an optional backend seam.** Discovery, scoring, and
routing run in the browser using the same keyless, CORS-friendly APIs already
in use (Overpass/OSM, OSRM, Open-Meteo). No new infrastructure required to
ship. A clean hook is left so real Water Survey of Canada streamflow and
server-side caching can be added later via the existing `server/` "connect a
source" pattern (like the News endpoint). This preserves the app's
client-first philosophy and its DATA / ENGINE / LIVE / UI separation.

### Prerequisite: reproducible build

There is no `package.json`; `app.js` is a pre-built esbuild bundle of
`source-app.jsx`. Before any feature work, establish a local esbuild build:

- Add `package.json` with `react`, `react-dom`, `esbuild` (and `vitest` for
  tests) as devDependencies.
- Add a build script that bundles `source-app.jsx` → `app.js` (IIFE, minified),
  matching the current output shape.
- Self-host Leaflet + markercluster into the bundle/assets (see Reliability).
- Output remains the same static folder dragged to Netlify Drop. Deploy
  unchanged.

## Components

Kept small and single-purpose, each testable in isolation.

### 1. Discovery (`discovery` module)
- **`discoverSpots(loc, radiusKm)`**: builds and runs an Overpass QL query
  around `loc` for: `leisure=fishing`, `leisure=slipway`, dam/weir features
  (`waterway=dam|weir`), waterway access points, and **named**
  `waterway=river|stream`. Excludes unnamed small creeks and ponds.
- **Normalization**: collapse each named reach (many way-segments) to
  representative points spaced along the reach so one river ≠ dozens of pins.
  Deduplicate access points that coincide with a reach.
- **Staged radius**: default ~30 km (fast first result). A "Widen search"
  control expands toward the full ~2-hour driving envelope. This bounds
  Overpass load — a naive 160 km query is too large/slow.
- **Caching**: IndexedDB, 7-day TTL, keyed by rounded coords (mirrors the
  existing `fetchParking` cache pattern).

### 2. Terrain (`terrain` module)
- **`elevations(points)`**: batched elevation lookup (Open-Meteo elevation),
  chunked to stay within request limits.
- Derives inputs for the habitat proxy (see Scoring).

### 3. Species inference (`speciesInference` module)
- **`inferSpecies(spot)`** → ordered species list + inference confidence, using
  Ontario/Great Lakes rules:
  - Cold headwater / high-elevation small stream → brook/brown/rainbow trout.
  - River reaching a Great Lake within ~15 km of the shoreline (tunable
    constant) → seasonal steelhead/salmon runs.
  - Tailwater (a named reach immediately downstream of a `waterway=dam|weir`
    node) → resident trout (cold).
  - Lake / warm lowland river → smallmouth bass, pike, walleye, panfish.
- Extends the `SPECIES` table with warmwater species and monthly run/activity
  curves.

### 4. Scoring adaptation (`ENGINE`)
- **Habitat proxy** replacing hand-authored `h{}` for discovered spots:
  elevation + water type + latitude + tailwater flag → estimated cold-water
  retention, fed into the existing `modelStreamTemp`. Remaining habitat facets
  get coarse type-based defaults.
- `evaluate(sec, m, cond, now)` extended to accept a `source: 'verified' |
  'auto'` flag and apply a **confidence penalty** to `auto` spots so verified
  water outranks them when nearby.
- The rest of the scoring pipeline (seasonal, weather, feeding window, flow,
  freshness) is reused unchanged.

### 5. Weather batching (`LIVE`)
- Reuse the Open-Meteo multi-point pattern for dynamic spot sets, chunked to a
  safe number of points per call. Same fields already parsed by
  `parseStation`.

### 6. Ranking merge (`App`)
- Merge curated `RIVERS` evaluations with discovered-spot evaluations into one
  list, sorted by opportunity. Badges: "Verified water" / "Auto-discovered".
- Drive-time (OSRM) computed lazily only for the ~15 nearest shortlisted spots.

### 7. Routing & hand-off (`MapView` / routing module)
- **Google Maps deep links** (no API key) on spot + parking:
  - Directions to parking:
    `https://www.google.com/maps/dir/?api=1&destination=LAT,LON&travelmode=driving`
  - Open access point pin:
    `https://www.google.com/maps/search/?api=1&query=LAT,LON`
- **Hiking route**: OSRM **foot** profile (`/route/v1/foot/`) from nearest
  parking → access point, showing trail distance + walk time. Falls back to the
  current straight-line estimate (`walkEst`) if foot routing fails.

### 8. Reliability
- **Endpoint fallback + retry/backoff** for Overpass (e.g. add
  `overpass.kumi.systems`) and OSRM, since the public demo servers rate-limit
  and go down.
- **Self-host Leaflet + markercluster** in the bundle and cache them in `sw.js`
  so the map survives a bad/blocked CDN and works offline.

### 9. UI / usability
- **Unified ranked list** with source badges + confidence.
- **"Find water near me"** prominent; **"Widen search"** to expand radius.
- Raise minimum font sizes (current 7–10px labels are hard to read on the
  water).
- Add a **text/icon label** to score colors (colorblind-safe), not color alone.
- Friendlier map-offline state; consider default tab = Report (map needs a
  connection).
- **Fix stale `Footer` copy** that claims no parking/directions are provided —
  they now are.

## Data flow

1. User taps "Find water near me" → geolocation (fresh, higher accuracy).
2. `discoverSpots(loc, 30km)` → Overpass → normalized candidates (cached).
3. `elevations()` + `inferSpecies()` → habitat proxy + species per candidate.
4. Batched Open-Meteo weather for candidates → `parseStation` → conditions.
5. `evaluate(..., source:'auto')` per candidate; curated reaches evaluated as
   `source:'verified'`.
6. Merge + sort → unified ranked list with badges.
7. On spot select: parking (Overpass) + drive route (OSRM) + foot route (OSRM
   foot) + Google Maps links.
8. "Widen search" repeats 2–6 with the larger radius.

## Error handling

- Any discovery/enrichment API failure degrades gracefully: show curated water
  and whatever discovered spots succeeded; never blank-screen.
- Overpass/OSRM/Open-Meteo failures use fallback endpoints then cached data
  then a clear inline message (matching existing patterns like `parking ===
  "error"`).
- Offline: curated water + last-known weather + cached discovered spots still
  render; map shows the existing graceful note.
- Discovered-spot scores always visibly labeled lower-confidence / estimated.

## Testing

- **Vitest** harness for pure functions: discovery normalization/dedup, species
  inference rules, habitat proxy, Google Maps deep-link builders, scoring with
  `source` penalty, radius staging math.
- UI verified manually in browser/simulator (map interaction, routing panel,
  unified list, badges).

## Out of scope (YAGNI for now)

- Real streamflow / water-temp sensor integration (left as the backend seam).
- Species models outside Ontario / Great Lakes.
- User accounts / cloud sync (storage stays on-device).
- Crowd-sourced reports.

## Success criteria

- From an arbitrary Ontario/Great Lakes location, "Find water near me" returns
  ranked, scored, reachable spots within seconds.
- Verified reaches outrank discovered spots when nearby; badges make the
  distinction clear.
- Each spot offers parking, a drive route, a hiking route, and a working "Open
  in Google Maps" hand-off.
- Map and core report remain usable offline and when a CDN/API is down.
- Labels are legible at the water and not color-only.
