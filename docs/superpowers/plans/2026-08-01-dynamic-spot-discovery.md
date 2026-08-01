# Dynamic Spot Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the app discover and score fishable water ~2 hours around the angler anywhere in Ontario/Great Lakes country, alongside the 16 curated reaches, with parking, driving + hiking routes, and Google Maps hand-off.

**Architecture:** Client-first. New pure logic lives in focused `lib/*.js` ES modules that `source-app.jsx` imports; discovery/enrichment/routing use the existing keyless CORS APIs (Overpass, OSRM, Open-Meteo). Curated reaches remain a premium "Verified water" layer; discovered spots are scored through the existing engine at lower confidence and merged into one ranked list.

**Tech Stack:** React 18 (bundled via esbuild), IndexedDB, Leaflet + markercluster (self-hosted), Overpass/OSM, OSRM (driving + foot), Open-Meteo (forecast + elevation), Vitest for unit tests.

## Global Constraints

- Keyless, CORS-friendly APIs only (no server required to ship): Overpass, OSRM, Open-Meteo.
- All new pure logic goes in `lib/*.js` ES modules with Vitest tests; `source-app.jsx` keeps its top-level `createRoot` side effect and is never imported by tests.
- Build output stays the same static folder deployed via Netlify Drop: `index.html`, `app.js`, `manifest.webmanifest`, `sw.js`, `icons/`, plus self-hosted `vendor/` assets.
- Discovered spots MUST be visibly lower-confidence and badged "Auto-discovered"; curated reaches badged "Verified water" and outrank discovered spots when nearby.
- Discovery scope: access-tagged water (`leisure=fishing`, `leisure=slipway`, `waterway=dam|weir`) PLUS named `waterway=river|stream`; exclude unnamed small creeks and ponds.
- Geographic model: Ontario / Great Lakes species only.
- Bump `sw.js` `CACHE` constant on any shipped asset change so clients update.

---

### Task 0: Build, test, and vendoring scaffold

Establishes a reproducible build so edits to `source-app.jsx` and `lib/*.js` compile to `app.js`, sets up Vitest, self-hosts Leaflet, and initializes git so later tasks can commit.

**Files:**
- Create: `package.json`
- Create: `build.mjs`
- Create: `.gitignore`
- Create: `vitest.config.js`
- Create: `vendor/leaflet.js`, `vendor/leaflet.css`, `vendor/markercluster.js`, `vendor/MarkerCluster.css`, `vendor/MarkerCluster.Default.css` (downloaded)
- Modify: `index.html` (swap unpkg `<link>`/`<script>` for `./vendor/*`)

**Interfaces:**
- Produces: `npm run build` → regenerates `app.js`; `npm test` → runs Vitest.

- [ ] **Step 1: Initialize git**

```bash
cd /Users/faheemafridi/river-intel-pwa
git init
git add -A
git commit -m "chore: snapshot existing app before dynamic-discovery work"
```

- [ ] **Step 2: Create `.gitignore`**

```
node_modules/
.DS_Store
```

- [ ] **Step 3: Create `package.json`**

```json
{
  "name": "muddy-york-angling",
  "version": "2.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "node build.mjs",
    "test": "vitest run"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "esbuild": "^0.23.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 4: Create `build.mjs`**

```js
import { build } from "esbuild";

await build({
  entryPoints: ["source-app.jsx"],
  bundle: true,
  minify: true,
  format: "iife",
  target: ["es2019"],
  loader: { ".jsx": "jsx", ".js": "jsx" },
  jsx: "automatic",
  outfile: "app.js",
});
console.log("built app.js");
```

- [ ] **Step 5: Create `vitest.config.js`**

```js
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["lib/**/*.test.js"], environment: "node" },
});
```

- [ ] **Step 6: Install and build**

Run:
```bash
npm install && npm run build
```
Expected: `built app.js` and a regenerated `app.js` (still an IIFE bundle).

- [ ] **Step 7: Self-host Leaflet, then update `index.html`**

Download the five vendor assets:
```bash
mkdir -p vendor
curl -sL https://unpkg.com/leaflet@1.9.4/dist/leaflet.js -o vendor/leaflet.js
curl -sL https://unpkg.com/leaflet@1.9.4/dist/leaflet.css -o vendor/leaflet.css
curl -sL https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js -o vendor/markercluster.js
curl -sL https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css -o vendor/MarkerCluster.css
curl -sL https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css -o vendor/MarkerCluster.Default.css
```
In `index.html`, replace the four `https://unpkg.com/...` lines (the two `<link rel="stylesheet">` for leaflet + markercluster and the two `<script defer src>`) with:
```html
  <link rel="stylesheet" href="./vendor/leaflet.css" />
  <link rel="stylesheet" href="./vendor/MarkerCluster.css" />
  <link rel="stylesheet" href="./vendor/MarkerCluster.Default.css" />
  <script defer src="./vendor/leaflet.js"></script>
  <script defer src="./vendor/markercluster.js"></script>
```

- [ ] **Step 8: Verify app still loads**

Run:
```bash
python3 -m http.server 8000
```
Open http://localhost:8000 — the app boots, the Map tab renders tiles and the 16 markers. Stop the server.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: esbuild build, vitest, self-hosted leaflet"
```

---

### Task 1: Google Maps deep-link builders + footer copy fix

Pure URL builders for the "Open in Google Maps" hand-off, plus correcting the stale footer that claims no parking/directions are provided.

**Files:**
- Create: `lib/deeplinks.js`
- Create: `lib/deeplinks.test.js`
- Modify: `source-app.jsx` (the `Footer` component)

**Interfaces:**
- Produces:
  - `gmapsDirections(lat, lon, mode = "driving") => string`
  - `gmapsPin(lat, lon) => string`

- [ ] **Step 1: Write the failing test**

`lib/deeplinks.test.js`:
```js
import { describe, it, expect } from "vitest";
import { gmapsDirections, gmapsPin } from "./deeplinks.js";

describe("google maps deep links", () => {
  it("builds a driving directions url to a destination", () => {
    expect(gmapsDirections(43.71, -80.37)).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=43.71%2C-80.37&travelmode=driving"
    );
  });
  it("supports a walking travel mode", () => {
    expect(gmapsDirections(43.71, -80.37, "walking")).toContain("travelmode=walking");
  });
  it("builds a search pin url", () => {
    expect(gmapsPin(43.71, -80.37)).toBe(
      "https://www.google.com/maps/search/?api=1&query=43.71%2C-80.37"
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/deeplinks.test.js`
Expected: FAIL — cannot find module `./deeplinks.js`.

- [ ] **Step 3: Write minimal implementation**

`lib/deeplinks.js`:
```js
/* Google Maps universal deep links — no API key required. */
export function gmapsDirections(lat, lon, mode = "driving") {
  const dest = encodeURIComponent(`${lat},${lon}`);
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=${mode}`;
}
export function gmapsPin(lat, lon) {
  const q = encodeURIComponent(`${lat},${lon}`);
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/deeplinks.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Fix the stale footer copy**

In `source-app.jsx`, in the `Footer` component, replace the sentence
`No directions, access or parking are provided by design — the system scores fishing potential only.`
with:
`Parking, driving and walking routes are drawn from OpenStreetMap and OSRM as a convenience — always confirm access and legality on site.`

- [ ] **Step 6: Build and commit**

```bash
npm run build && git add -A && git commit -m "feat: google maps deep-link builders; fix footer copy"
```

---

### Task 2: Add Ontario/Great Lakes warmwater species

Extends the species vocabulary so discovered lakes and warm lowland rivers can be scored and advised.

**Files:**
- Modify: `source-app.jsx` (the `SPECIES` object)

**Interfaces:**
- Produces: new `SPECIES` keys `SMB`, `NP`, `WAL`, `PAN` (each `{name, short, mode, color, a:[12 monthly 0..1]}`), consumed by species inference (Task 3) and the engine.

- [ ] **Step 1: Add the species**

In `source-app.jsx`, inside the `SPECIES` object (after `LAT`), add:
```js
  SMB:{name:"Smallmouth bass",short:"SMB",mode:"resident",color:C.amber,
    a:[0.05,0.05,0.10,0.35,0.75,0.95,0.90,0.85,0.75,0.55,0.20,0.08]},
  NP:{name:"Northern pike",short:"NP",mode:"resident",color:C.cyan,
    a:[0.35,0.35,0.55,0.85,0.80,0.60,0.50,0.50,0.65,0.80,0.70,0.45]},
  WAL:{name:"Walleye",short:"WAL",mode:"resident",color:C.amber,
    a:[0.30,0.30,0.55,0.80,0.70,0.60,0.55,0.55,0.70,0.80,0.60,0.40]},
  PAN:{name:"Panfish",short:"PAN",mode:"resident",color:C.cyan,
    a:[0.15,0.15,0.30,0.60,0.85,0.95,0.90,0.85,0.75,0.55,0.30,0.18]},
```

- [ ] **Step 2: Build to confirm no syntax error**

Run: `npm run build`
Expected: `built app.js`, no error.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: add warmwater species (SMB, NP, WAL, PAN)"
```

---

### Task 3: Species inference module

Pure rules mapping a discovered spot's traits to likely species keys.

**Files:**
- Create: `lib/species-inference.js`
- Create: `lib/species-inference.test.js`

**Interfaces:**
- Consumes: nothing (returns bare species-key strings so it does not import `SPECIES`).
- Produces: `inferSpecies(spot) => string[]` where `spot = { waterType: "river"|"stream"|"lake", elevationM: number, nearGreatLakeKm: number|null, isTailwater: boolean }`. Returns 1–4 keys, most-likely first, drawn from `["BKT","BNT","RBT","STL","CHN","SMB","NP","WAL","PAN","LAT"]`.

- [ ] **Step 1: Write the failing test**

`lib/species-inference.test.js`:
```js
import { describe, it, expect } from "vitest";
import { inferSpecies } from "./species-inference.js";

describe("inferSpecies", () => {
  it("cold high-elevation small stream => resident trout", () => {
    const r = inferSpecies({ waterType: "stream", elevationM: 420, nearGreatLakeKm: 80, isTailwater: false });
    expect(r[0]).toBe("BKT");
    expect(r).toContain("BNT");
  });
  it("river near a Great Lake => steelhead/salmon run water", () => {
    const r = inferSpecies({ waterType: "river", elevationM: 90, nearGreatLakeKm: 6, isTailwater: false });
    expect(r).toContain("STL");
    expect(r).toContain("CHN");
  });
  it("tailwater => cold resident trout", () => {
    const r = inferSpecies({ waterType: "river", elevationM: 200, nearGreatLakeKm: 60, isTailwater: true });
    expect(r[0]).toBe("BNT");
    expect(r).toContain("RBT");
  });
  it("lake => warmwater set", () => {
    const r = inferSpecies({ waterType: "lake", elevationM: 180, nearGreatLakeKm: null, isTailwater: false });
    expect(r).toEqual(expect.arrayContaining(["SMB", "WAL", "NP", "PAN"]));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/species-inference.test.js`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

`lib/species-inference.js`:
```js
/* Ontario / Great Lakes species inference from coarse spot traits.
   Returns species-key strings, most-likely first. Pure. */
export function inferSpecies(spot) {
  const { waterType, elevationM, nearGreatLakeKm, isTailwater } = spot;
  if (isTailwater) return ["BNT", "RBT", "BKT"];
  if (waterType === "lake") return ["SMB", "WAL", "NP", "PAN"];
  const nearLake = nearGreatLakeKm != null && nearGreatLakeKm <= 15;
  if (waterType === "river" && nearLake) return ["STL", "CHN", "BNT"];
  const cold = elevationM >= 350;
  if (waterType === "stream") {
    return cold ? ["BKT", "BNT", "RBT"] : ["BNT", "RBT", "SMB"];
  }
  // inland river
  return cold ? ["BNT", "RBT", "SMB"] : ["SMB", "WAL", "NP", "PAN"];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/species-inference.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: species inference for discovered spots"
```

---

### Task 4: Habitat proxy module

Derives the `h{}` habitat facets (that curated reaches hand-author) from terrain traits, so `modelStreamTemp` and `habitatComposite` work on discovered spots.

**Files:**
- Create: `lib/habitat-proxy.js`
- Create: `lib/habitat-proxy.test.js`

**Interfaces:**
- Produces: `deriveHabitat(spot) => { hold, struct, spawn, cold, ox, gw }` (each 0..100), where `spot` is the same shape as Task 3's input. Consumed by the engine wiring in Task 6/9 to build a `sec`-like object.

- [ ] **Step 1: Write the failing test**

`lib/habitat-proxy.test.js`:
```js
import { describe, it, expect } from "vitest";
import { deriveHabitat } from "./habitat-proxy.js";

describe("deriveHabitat", () => {
  it("cold water rises with elevation and tailwater", () => {
    const low = deriveHabitat({ waterType: "river", elevationM: 90, nearGreatLakeKm: 8, isTailwater: false });
    const high = deriveHabitat({ waterType: "stream", elevationM: 450, nearGreatLakeKm: 90, isTailwater: false });
    const tail = deriveHabitat({ waterType: "river", elevationM: 200, nearGreatLakeKm: 60, isTailwater: true });
    expect(high.cold).toBeGreaterThan(low.cold);
    expect(tail.cold).toBeGreaterThan(low.cold);
  });
  it("returns all six facets within 0..100", () => {
    const h = deriveHabitat({ waterType: "lake", elevationM: 180, nearGreatLakeKm: null, isTailwater: false });
    for (const k of ["hold", "struct", "spawn", "cold", "ox", "gw"]) {
      expect(h[k]).toBeGreaterThanOrEqual(0);
      expect(h[k]).toBeLessThanOrEqual(100);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/habitat-proxy.test.js`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

`lib/habitat-proxy.js`:
```js
/* Coarse habitat proxy for discovered spots. Pure. Values are deliberately
   conservative so curated reaches (with real numbers) outrank these. */
const clamp = (v) => Math.max(0, Math.min(100, Math.round(v)));

export function deriveHabitat(spot) {
  const { waterType, elevationM, isTailwater } = spot;
  // elevation 80..500 m maps to a cold contribution 0..55
  const elevCold = ((Math.max(80, Math.min(500, elevationM)) - 80) / 420) * 55;
  const streamBonus = waterType === "stream" ? 15 : 0;
  const tailBonus = isTailwater ? 40 : 0;
  const cold = clamp(30 + elevCold + streamBonus + tailBonus);
  const gw = clamp(cold - 10 + (waterType === "stream" ? 10 : 0));
  const ox = clamp(waterType === "lake" ? 60 : 72 + elevCold * 0.2);
  const struct = clamp(waterType === "lake" ? 65 : 60);
  const hold = clamp(waterType === "river" ? 68 : waterType === "lake" ? 60 : 55);
  const spawn = clamp(waterType === "stream" ? 65 : 55);
  return { hold, struct, spawn, cold, ox, gw };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/habitat-proxy.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: habitat proxy for discovered spots"
```

---

### Task 5: Resilient fetch helper (endpoint fallback + retry)

Shared HTTP helper used by discovery and routing so a downed public endpoint doesn't blank the feature.

**Files:**
- Create: `lib/http.js`
- Create: `lib/http.test.js`

**Interfaces:**
- Produces: `fetchWithFallback(urls, options, { retries = 1, fetchImpl = fetch }) => Promise<Response>` — tries each URL in order; on network error or non-ok response, retries the same URL up to `retries` times (200ms backoff) then advances to the next URL; rejects if all fail.

- [ ] **Step 1: Write the failing test**

`lib/http.test.js`:
```js
import { describe, it, expect, vi } from "vitest";
import { fetchWithFallback } from "./http.js";

const ok = (body = "{}") => new Response(body, { status: 200 });
const bad = () => new Response("", { status: 502 });

describe("fetchWithFallback", () => {
  it("returns the first ok response", async () => {
    const f = vi.fn().mockResolvedValueOnce(ok("A"));
    const r = await fetchWithFallback(["u1", "u2"], {}, { retries: 0, fetchImpl: f });
    expect(await r.text()).toBe("A");
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("falls back to the next url when the first fails", async () => {
    const f = vi.fn().mockResolvedValueOnce(bad()).mockResolvedValueOnce(ok("B"));
    const r = await fetchWithFallback(["u1", "u2"], {}, { retries: 0, fetchImpl: f });
    expect(await r.text()).toBe("B");
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("rejects when every url fails", async () => {
    const f = vi.fn().mockResolvedValue(bad());
    await expect(
      fetchWithFallback(["u1", "u2"], {}, { retries: 0, fetchImpl: f })
    ).rejects.toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/http.test.js`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

`lib/http.js`:
```js
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchWithFallback(urls, options = {}, opts = {}) {
  const { retries = 1, fetchImpl = fetch, backoffMs = 200 } = opts;
  let lastErr = new Error("no urls");
  for (const url of urls) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetchImpl(url, options);
        if (res && res.ok) return res;
        lastErr = new Error("bad status " + (res && res.status));
      } catch (e) {
        lastErr = e;
      }
      if (attempt < retries) await sleep(backoffMs);
    }
  }
  throw lastErr;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/http.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: resilient fetch with endpoint fallback and retry"
```

---

### Task 6: Discovery — Overpass parsing & normalization

The pure core of discovery: turn an Overpass JSON response into deduped, normalized candidate spots. (Network fetch is thin and wired in Task 9.)

**Files:**
- Create: `lib/discovery.js`
- Create: `lib/discovery.test.js`

**Interfaces:**
- Consumes: `haversineKm`-style distance (defined locally in this module to stay test-isolated).
- Produces:
  - `buildOverpassQuery(lat, lon, radiusM) => string`
  - `parseOverpassSpots(json, loc) => Spot[]` where `Spot = { id, name, lat, lon, waterType, isTailwater, kind }`, `kind ∈ {"access","slipway","dam","reach"}`. Named reaches are collapsed to one representative point (nearest point on the reach to `loc`); unnamed streams/ponds are dropped.
  - `nearGreatLakeKm(lat, lon) => number|null` (distance to nearest Great Lake shoreline reference point).

- [ ] **Step 1: Write the failing test**

`lib/discovery.test.js`:
```js
import { describe, it, expect } from "vitest";
import { buildOverpassQuery, parseOverpassSpots, nearGreatLakeKm } from "./discovery.js";

describe("buildOverpassQuery", () => {
  it("includes access, slipway, dam and named waterways within radius", () => {
    const q = buildOverpassQuery(43.7, -80.3, 30000);
    expect(q).toContain('leisure"="fishing"');
    expect(q).toContain('leisure"="slipway"');
    expect(q).toContain('waterway"="dam"');
    expect(q).toContain("around:30000,43.7,-80.3");
  });
});

describe("parseOverpassSpots", () => {
  const loc = { lat: 43.70, lon: -80.30 };
  it("keeps a named river reach as one representative point", () => {
    const json = { elements: [
      { type: "way", id: 1, tags: { waterway: "river", name: "Grand River" },
        geometry: [ { lat: 43.71, lon: -80.31 }, { lat: 43.72, lon: -80.33 } ] },
    ] };
    const spots = parseOverpassSpots(json, loc);
    expect(spots).toHaveLength(1);
    expect(spots[0].name).toBe("Grand River");
    expect(spots[0].kind).toBe("reach");
    expect(spots[0].waterType).toBe("river");
  });
  it("drops unnamed streams", () => {
    const json = { elements: [
      { type: "way", id: 2, tags: { waterway: "stream" },
        geometry: [ { lat: 43.71, lon: -80.31 } ] },
    ] };
    expect(parseOverpassSpots(json, loc)).toHaveLength(0);
  });
  it("keeps fishing access and slipway nodes", () => {
    const json = { elements: [
      { type: "node", id: 3, lat: 43.71, lon: -80.31, tags: { leisure: "fishing", name: "The Bend" } },
      { type: "node", id: 4, lat: 43.72, lon: -80.32, tags: { leisure: "slipway" } },
    ] };
    const spots = parseOverpassSpots(json, loc);
    expect(spots.map((s) => s.kind).sort()).toEqual(["access", "slipway"]);
  });
  it("flags a reach immediately below a dam as tailwater", () => {
    const json = { elements: [
      { type: "node", id: 5, lat: 43.710, lon: -80.310, tags: { waterway: "dam" } },
      { type: "way", id: 6, tags: { waterway: "river", name: "Below Dam River" },
        geometry: [ { lat: 43.7105, lon: -80.3105 }, { lat: 43.715, lon: -80.32 } ] },
    ] };
    const reach = parseOverpassSpots(json, loc).find((s) => s.kind === "reach");
    expect(reach.isTailwater).toBe(true);
  });
});

describe("nearGreatLakeKm", () => {
  it("is small near Lake Ontario shoreline and null far inland-null-safe", () => {
    expect(nearGreatLakeKm(43.62, -79.38)).toBeLessThan(30); // Toronto lakeshore
    expect(nearGreatLakeKm(45.5, -78.0)).toBeGreaterThan(60); // Algonquin-ish
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/discovery.test.js`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

`lib/discovery.js`:
```js
/* Discovery core: Overpass query building + pure normalization. */
const R = 6371;
const toR = (x) => (x * Math.PI) / 180;
function km(a, b, c, d) {
  const dLa = toR(c - a), dLo = toR(d - b);
  const s = Math.sin(dLa / 2) ** 2 + Math.cos(toR(a)) * Math.cos(toR(c)) * Math.sin(dLo / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

// A few shoreline reference points, one per Great Lake, for a coarse "near a
// Great Lake" test. Not a polygon — good enough to flag tributary run water.
const GREAT_LAKE_REFS = [
  [43.62, -79.38], [43.25, -79.80], [43.90, -78.30], // L. Ontario (TO, Hamilton, Cobourg)
  [42.90, -79.90], [42.30, -81.20],                   // L. Erie
  [44.55, -80.45], [44.75, -80.90], [44.35, -79.70], // Georgian Bay / L. Huron
];

export function nearGreatLakeKm(lat, lon) {
  let best = null;
  for (const [la, lo] of GREAT_LAKE_REFS) {
    const d = km(lat, lon, la, lo);
    if (best == null || d < best) best = d;
  }
  return best;
}

export function buildOverpassQuery(lat, lon, radiusM) {
  const a = `around:${radiusM},${lat},${lon}`;
  return `[out:json][timeout:25];(` +
    `node["leisure"="fishing"](${a});` +
    `node["leisure"="slipway"](${a});` +
    `node["waterway"="dam"](${a});node["waterway"="weir"](${a});` +
    `way["waterway"="river"]["name"](${a});` +
    `way["waterway"="stream"]["name"](${a});` +
    `);out tags geom center 200;`;
}

function reachRepPoint(geom, loc) {
  let best = null;
  for (const p of geom) {
    const d = km(loc.lat, loc.lon, p.lat, p.lon);
    if (!best || d < best.d) best = { lat: p.lat, lon: p.lon, d };
  }
  return best;
}

export function parseOverpassSpots(json, loc) {
  const els = (json && json.elements) || [];
  const dams = els
    .filter((e) => e.tags && (e.tags.waterway === "dam" || e.tags.waterway === "weir") && e.lat != null)
    .map((e) => ({ lat: e.lat, lon: e.lon }));
  const isBelowDam = (lat, lon) => dams.some((d) => km(d.lat, d.lon, lat, lon) <= 1.2);

  const spots = [];
  for (const e of els) {
    const t = e.tags || {};
    if (t.leisure === "fishing" && e.lat != null) {
      spots.push({ id: `n${e.id}`, name: t.name || "Fishing access", lat: e.lat, lon: e.lon,
        waterType: "river", isTailwater: isBelowDam(e.lat, e.lon), kind: "access" });
    } else if (t.leisure === "slipway" && e.lat != null) {
      spots.push({ id: `n${e.id}`, name: t.name || "Boat launch", lat: e.lat, lon: e.lon,
        waterType: "lake", isTailwater: false, kind: "slipway" });
    } else if ((t.waterway === "river" || t.waterway === "stream") && t.name && Array.isArray(e.geometry)) {
      const rep = reachRepPoint(e.geometry, loc);
      if (!rep) continue;
      spots.push({ id: `w${e.id}`, name: t.name, lat: rep.lat, lon: rep.lon,
        waterType: t.waterway, isTailwater: isBelowDam(rep.lat, rep.lon), kind: "reach" });
    }
  }
  // dedupe reaches sharing a name to the nearest representative point
  const byName = new Map();
  const out = [];
  for (const s of spots) {
    if (s.kind !== "reach") { out.push(s); continue; }
    const cur = byName.get(s.name);
    const d = km(loc.lat, loc.lon, s.lat, s.lon);
    if (!cur || d < cur.d) byName.set(s.name, { spot: s, d });
  }
  for (const { spot } of byName.values()) out.push(spot);
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/discovery.test.js`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: discovery overpass query + normalization core"
```

---

### Task 7: Elevation enrichment

Batched elevation lookup so the habitat proxy has real terrain input.

**Files:**
- Create: `lib/terrain.js`
- Create: `lib/terrain.test.js`

**Interfaces:**
- Produces: `elevations(points, { fetchImpl = fetch }) => Promise<number[]>` — takes `[{lat,lon}]`, returns elevation in metres aligned by index, chunked ≤ 100 per Open-Meteo call; on failure returns `200` per point (a safe inland default).

- [ ] **Step 1: Write the failing test**

`lib/terrain.test.js`:
```js
import { describe, it, expect, vi } from "vitest";
import { elevations } from "./terrain.js";

describe("elevations", () => {
  it("returns elevations aligned to input points", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ elevation: [100, 250] }), { status: 200 })
    );
    const r = await elevations([{ lat: 43.7, lon: -80.3 }, { lat: 44.0, lon: -80.5 }], { fetchImpl });
    expect(r).toEqual([100, 250]);
  });
  it("falls back to 200 m on failure", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("net"));
    const r = await elevations([{ lat: 43.7, lon: -80.3 }], { fetchImpl });
    expect(r).toEqual([200]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/terrain.test.js`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

`lib/terrain.js`:
```js
/* Batched elevation via Open-Meteo elevation API. */
function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

export async function elevations(points, opts = {}) {
  const { fetchImpl = fetch } = opts;
  const out = [];
  for (const group of chunk(points, 100)) {
    const lats = group.map((p) => p.lat).join(",");
    const lons = group.map((p) => p.lon).join(",");
    try {
      const res = await fetchImpl(
        `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lons}`
      );
      if (!res.ok) throw new Error("bad");
      const d = await res.json();
      const arr = Array.isArray(d.elevation) ? d.elevation : [];
      group.forEach((_, i) => out.push(arr[i] != null ? arr[i] : 200));
    } catch (e) {
      group.forEach(() => out.push(200));
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/terrain.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: batched elevation enrichment"
```

---

### Task 8: Source confidence penalty (pure engine helper)

Isolates the "discovered spots score lower confidence" rule as a tested pure helper that Task 9 wires into `evaluate`.

**Files:**
- Create: `lib/scoring-extra.js`
- Create: `lib/scoring-extra.test.js`

**Interfaces:**
- Produces:
  - `applySourcePenalty(confidence, source) => number` — `source==="auto"` multiplies confidence by 0.7 and caps at 70; `"verified"` returns it unchanged.
  - `sourceBadge(source) => string` — `"Verified water"` or `"Auto-discovered"`.

- [ ] **Step 1: Write the failing test**

`lib/scoring-extra.test.js`:
```js
import { describe, it, expect } from "vitest";
import { applySourcePenalty, sourceBadge } from "./scoring-extra.js";

describe("applySourcePenalty", () => {
  it("leaves verified confidence unchanged", () => {
    expect(applySourcePenalty(88, "verified")).toBe(88);
  });
  it("penalizes and caps auto confidence", () => {
    expect(applySourcePenalty(88, "auto")).toBeLessThanOrEqual(70);
    expect(applySourcePenalty(50, "auto")).toBe(35);
  });
});
describe("sourceBadge", () => {
  it("labels each source", () => {
    expect(sourceBadge("verified")).toBe("Verified water");
    expect(sourceBadge("auto")).toBe("Auto-discovered");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/scoring-extra.test.js`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

`lib/scoring-extra.js`:
```js
export function applySourcePenalty(confidence, source) {
  if (source === "auto") return Math.min(70, Math.round(confidence * 0.7));
  return confidence;
}
export function sourceBadge(source) {
  return source === "auto" ? "Auto-discovered" : "Verified water";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/scoring-extra.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: source confidence penalty + badge helpers"
```

---

### Task 9: Wire discovery into the app (data flow + unified ranked list)

Connects all modules: on "Find water near me", discover → enrich → score → merge with curated → render one badged, ranked list. This is an integration task; verification is build + manual (the pure pieces are already covered by Tasks 1–8).

**Files:**
- Modify: `source-app.jsx` (imports at top; `App` component state + effects; the Report/`today` tab list rendering; `RecCard` badge; a new `discoverNearby` function)

**Interfaces:**
- Consumes: `buildOverpassQuery`, `parseOverpassSpots`, `nearGreatLakeKm` (Task 6); `elevations` (Task 7); `inferSpecies` (Task 3); `deriveHabitat` (Task 4); `fetchWithFallback` (Task 5); `applySourcePenalty`, `sourceBadge` (Task 8).
- Produces: discovered `sec`-shaped objects fed through the existing `evaluate`, tagged `source:"auto"`, merged into `ranked`.

- [ ] **Step 1: Add imports at the top of `source-app.jsx`**

After the existing React import lines, add:
```js
import { buildOverpassQuery, parseOverpassSpots, nearGreatLakeKm } from "./lib/discovery.js";
import { elevations } from "./lib/terrain.js";
import { inferSpecies } from "./lib/species-inference.js";
import { deriveHabitat } from "./lib/habitat-proxy.js";
import { fetchWithFallback } from "./lib/http.js";
import { applySourcePenalty, sourceBadge } from "./lib/scoring-extra.js";
```

- [ ] **Step 2: Add a discovery builder near the LIVE LAYER section**

Add this function (converts discovered spots into curated-shaped `sec` objects). Place it after `fetchDriveRoute` in `source-app.jsx`:
```js
const OVERPASS_HOSTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

async function discoverSecs(loc, radiusM) {
  const key = `disco:${loc.lat.toFixed(2)},${loc.lon.toFixed(2)}:${radiusM}`;
  try { const c = await dbGet(key); if (c && Date.now() - c.ts < 7 * 864e5) return c.list; } catch (e) {}
  const body = "data=" + encodeURIComponent(buildOverpassQuery(loc.lat, loc.lon, radiusM));
  let json;
  try {
    const res = await fetchWithFallback(OVERPASS_HOSTS,
      { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body },
      { retries: 1 });
    json = await res.json();
  } catch (e) { return null; }
  const spots = parseOverpassSpots(json, loc);
  const elev = await elevations(spots.map((s) => ({ lat: s.lat, lon: s.lon })));
  const list = spots.map((s, i) => {
    const traits = { waterType: s.waterType, elevationM: elev[i],
      nearGreatLakeKm: nearGreatLakeKm(s.lat, s.lon), isTailwater: s.isTailwater };
    const species = inferSpecies(traits);
    const h = deriveHabitat(traits);
    return { id: "auto-" + s.id, river: s.name, section: sectionLabel(s), region: "Discovered",
      zone: "Check regs", water: waterLabel(s), species, lat: s.lat, lon: s.lon, h,
      history: 55, report: 0, reportAge: 24, conf: 60, note: discoveredNote(s, traits), source: "auto" };
  });
  try { await dbSet(key, { ts: Date.now(), list }); } catch (e) {}
  return list;
}
function sectionLabel(s){ return s.kind==="slipway"?"Boat launch":s.kind==="access"?"Fishing access":s.isTailwater?"Tailwater reach":"River reach"; }
function waterLabel(s){ return s.waterType==="lake"?"Lake / launch":s.waterType==="stream"?"Named stream":"Named river"; }
function discoveredNote(s, t){ return `Auto-discovered from OpenStreetMap${t.isTailwater?" below a dam (likely cold tailwater)":""}. Habitat and species are estimated from terrain — confirm access, regulations and seasons before fishing.`; }
```

- [ ] **Step 3: Add discovery state + trigger in `App`**

In `App`, add state near the other `useState` calls:
```js
const [discovered,setDiscovered]=useState([]);   // sec-shaped auto spots
const [discoStatus,setDiscoStatus]=useState("idle"); // idle|loading|done|error
const [radiusM,setRadiusM]=useState(30000);
```
Add a callback (place near `requestLocation`):
```js
const discoverNearby=useCallback(async(r)=>{
  if(!userLoc){ requestLocation(); return; }
  setDiscoStatus("loading");
  const list=await discoverSecs(userLoc, r||radiusM);
  if(list==null){ setDiscoStatus("error"); return; }
  setDiscovered(list); setDiscoStatus("done");
},[userLoc,radiusM,requestLocation]);
```

- [ ] **Step 4: Merge discovered into `ranked`**

Change the `ranked` memo so it evaluates curated + discovered and tags source. Replace the existing `ranked` `useMemo` with:
```js
const ranked=useMemo(()=>{
  const curated=RIVERS.map(s=>({...evaluate(s,month,condFor(s),now),source:"verified"}));
  const auto=discovered.map(s=>{ const ev=evaluate(s,month,condFor(s),now);
    return {...ev,source:"auto",confidence:applySourcePenalty(ev.confidence,"auto")}; });
  return [...curated,...auto].sort((a,b)=>b.opportunity-a.opportunity);
},[month,now,condFor,discovered]);
```
Note: `condFor` falls back to the seasonal model for spots with no live-weather entry (discovered spots have no `wx[id]`), which is the intended behavior — they score on the seasonal/terrain proxy until Task 10's optional weather batching runs.

- [ ] **Step 5: Add the "Find / Widen water near me" control**

In the control panel block (the `!manual && (...)` location row), add after the location button:
```js
{userLoc && <button onClick={()=>discoverNearby(radiusM)} style={{...btn,borderColor:C.brass,color:C.pine}}>
  {discoStatus==="loading"?"Scouting…":discovered.length?`◎ ${discovered.length} spots found`:"Find water near me"}</button>}
{userLoc && discovered.length>0 && <button onClick={()=>{const nr=Math.min(radiusM+40000,150000);setRadiusM(nr);discoverNearby(nr);}} style={{...btn,borderColor:C.line,color:C.textDim}}>Widen search</button>}
{discoStatus==="error" && <span style={{fontFamily:mono,fontSize:10,color:C.amber}}>Couldn't scout new water just now — try again shortly.</span>}
```

- [ ] **Step 6: Show the source badge on cards**

In `RecCard`, under the section line, add a badge. After the `<div>` showing `sec.section`, insert:
```js
<div style={{fontFamily:sans,fontSize:9,letterSpacing:1,textTransform:"uppercase",fontWeight:700,color:ev.source==="auto"?C.textDim:C.pine,marginTop:4}}>{sourceBadge(ev.source)}</div>
```
Pass `source` through: `RecCard` already receives `ev`, which now carries `.source`. No signature change needed.

- [ ] **Step 7: Build and manually verify**

Run: `npm run build` then `python3 -m http.server 8000`.
Manual checks:
1. Open the app, tab to Report, tap "Find water near me", allow location.
2. New badged "Auto-discovered" spots appear in the ranked list; curated spots show "Verified water".
3. "Widen search" increases the count.
4. With location denied, the button prompts for location instead of crashing.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: discover, score and merge nearby spots into ranked list"
```

---

### Task 10: Discovered-spot weather batching (optional live upgrade)

Gives discovered spots live conditions (not just the seasonal model) by batching their coordinates through Open-Meteo, reusing `parseStation`.

**Files:**
- Modify: `source-app.jsx` (`discoverSecs` and `condFor`/`wx` merge)

**Interfaces:**
- Consumes: existing `parseStation`, `deriveFlow`.
- Produces: entries added to the `wx` map keyed by discovered `sec.id`, so `condFor` returns live reads for them.

- [ ] **Step 1: Fetch weather for discovered spots**

In `discoverSecs`, after building `list`, add batched weather and merge into a module-level setter passed in. Simplest wiring: return `{list, coords}` and let `discoverNearby` fetch weather. Change the end of `discoverSecs` to also compute a weather URL:
```js
  const wxUrl = "https://api.open-meteo.com/v1/forecast?latitude=" +
    list.map(s=>s.lat).join(",") + "&longitude=" + list.map(s=>s.lon).join(",") +
    "&current=temperature_2m,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,pressure_msl,cloud_cover" +
    "&hourly=pressure_msl&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,sunrise,sunset&past_days=5&forecast_days=3&timezone=America%2FToronto";
  try{ await dbSet(key,{ts:Date.now(),list}); }catch(e){}
  return { list, wxUrl };
```
Update the top-of-function cache return to match the new shape:
```js
  try { const c=await dbGet(key); if(c&&Date.now()-c.ts<7*864e5) return {list:c.list, wxUrl:c.wxUrl||null}; } catch(e){}
```
and store `wxUrl` in the cache object: `await dbSet(key,{ts:Date.now(),list,wxUrl});`

- [ ] **Step 2: Merge discovered weather into `wx` in `discoverNearby`**

Replace the body of `discoverNearby` with:
```js
const discoverNearby=useCallback(async(r)=>{
  if(!userLoc){ requestLocation(); return; }
  setDiscoStatus("loading");
  const out=await discoverSecs(userLoc, r||radiusM);
  if(out==null){ setDiscoStatus("error"); return; }
  setDiscovered(out.list);
  if(out.wxUrl){
    try{ const res=await fetch(out.wxUrl); if(res.ok){ const data=await res.json();
      const arr=Array.isArray(data)?data:[data]; const add={};
      out.list.forEach((s,i)=>{ const p=arr[i]?parseStation(arr[i]):null; if(p) add[s.id]=p; });
      setWx(prev=>({...prev,...add}));
    } }catch(e){}
  }
  setDiscoStatus("done");
},[userLoc,radiusM,requestLocation]);
```

- [ ] **Step 3: Build and manually verify**

Run: `npm run build`, reload. Open a discovered spot's card — its Conditions strip now shows live Air/Wind/Pressure like curated spots (not just modeled water temp). If Open-Meteo is unreachable, it silently keeps the seasonal model (no crash).

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: live weather for discovered spots"
```

---

### Task 11: Google Maps + hiking route in the map card

Adds the "Open in Google Maps" hand-off and a real walking (foot) route from parking to the access point, for every selected spot.

**Files:**
- Modify: `source-app.jsx` (`fetchDriveRoute` sibling for foot; `MapView` parking/route panel; imports)

**Interfaces:**
- Consumes: `gmapsDirections`, `gmapsPin` (Task 1); existing `fetchDriveRoute`, `walkEst`, `distM`.
- Produces: `fetchFootRoute(from, to) => Promise<{coords, distKm, durMin}|null>`.

- [ ] **Step 1: Import deep links**

Add to the import block:
```js
import { gmapsDirections, gmapsPin } from "./lib/deeplinks.js";
```

- [ ] **Step 2: Add a foot-route fetcher**

Next to `fetchDriveRoute`, add:
```js
async function fetchFootRoute(from,to){
  try{
    const u=`https://router.project-osrm.org/route/v1/foot/${from.lon},${from.lat};${to.lon},${to.lat}?overview=full&geometries=geojson`;
    const r=await fetch(u); if(!r.ok) throw 0; const d=await r.json();
    const rt=d.routes&&d.routes[0]; if(!rt) return null;
    return { coords: rt.geometry.coordinates.map(c=>[c[1],c[0]]), distKm:+(rt.distance/1000).toFixed(2), durMin:Math.round(rt.duration/60) };
  }catch(e){ return null; }
}
```

- [ ] **Step 3: Use the foot route in `routeFromMe`**

In `MapView`'s `routeFromMe`, after the drive route resolves, also request the foot route and prefer it over the straight-line for the walk leg:
```js
const routeFromMe=()=>{
  if(!userLoc||!nearestP||!sec) return;
  setRouteStatus("loading");
  fetchDriveRoute(userLoc,nearestP.p).then(async dr=>{
    if(!dr){ setRouteStatus("error"); return; }
    const foot=await fetchFootRoute({lat:nearestP.p.lat,lon:nearestP.p.lon},{lat:sec.lat,lon:sec.lon});
    setRouteStatus("done");
    setRoute({drive:dr,
      walk: foot
        ? {from:[nearestP.p.lat,nearestP.p.lon],to:[sec.lat,sec.lon],coords:foot.coords,min:foot.durMin,km:foot.distKm,trail:true}
        : {from:[nearestP.p.lat,nearestP.p.lon],to:[sec.lat,sec.lon],...walkEst(distM(nearestP.p.lat,nearestP.p.lon,sec.lat,sec.lon)),trail:false} });
  });
};
```

- [ ] **Step 4: Draw the trail polyline when present**

In the route-drawing effect, change the walk branch to draw the trail geometry if available:
```js
if(route.walk){
  const line = route.walk.coords ? route.walk.coords : [route.walk.from,route.walk.to];
  L.polyline(line,{color:C.brass,weight:4,dashArray:route.walk.trail?null:"2,8",opacity:.95}).addTo(g);
  line.forEach(c=>all.push(c));
}
```

- [ ] **Step 5: Add Google Maps buttons**

In the parking/route panel of `MapView` (where "🚗 Route from me" lives), add alongside it:
```js
<a href={gmapsDirections(nearestP.p.lat,nearestP.p.lon)} target="_blank" rel="noopener noreferrer" style={{...btn,borderColor:C.pine,color:C.pine,textDecoration:"none"}}>🗺️ Directions (parking)</a>
<a href={gmapsPin(sec.lat,sec.lon)} target="_blank" rel="noopener noreferrer" style={{...btn,borderColor:C.line,color:C.textDim,textDecoration:"none"}}>📍 Access point</a>
```
And update the route summary line to note the trail when present:
```js
{route && <div style={{...small,marginTop:8}}>Drive <b style={{color:C.text}}>{route.drive.durMin} min</b> ({route.drive.distKm} km) to parking, then {route.walk.trail?"walk the trail":"walk"} <b style={{color:C.text}}>~{route.walk.min} min</b> ({route.walk.km} km) to the access. <button onClick={()=>setRoute(null)} style={{background:"none",border:"none",color:C.brick,cursor:"pointer",fontSize:12,textDecoration:"underline",padding:0}}>clear</button></div>}
```

- [ ] **Step 6: Build and manually verify**

Run: `npm run build`, reload. Select a spot on the map:
1. "🗺️ Directions (parking)" opens Google Maps driving directions to the parking pin in a new tab.
2. "📍 Access point" opens a Google Maps pin at the water.
3. "🚗 Route from me" (with location on) draws the drive plus a trail-following walk line (solid when a foot route was found, dashed straight-line when not).

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: google maps hand-off + hiking (foot) route"
```

---

### Task 12: Reliability — cache vendor assets offline

Makes the self-hosted Leaflet assets available offline so the map works without a connection after first load.

**Files:**
- Modify: `sw.js` (`CACHE` bump + add vendor assets to `SHELL`)

**Interfaces:**
- None (service worker only).

- [ ] **Step 1: Update the shell list and bump the cache**

In `sw.js`, change `const CACHE = "river-intel-v1";` to `const CACHE = "river-intel-v2";` and add to the `SHELL` array:
```js
  "./vendor/leaflet.js",
  "./vendor/leaflet.css",
  "./vendor/markercluster.js",
  "./vendor/MarkerCluster.css",
  "./vendor/MarkerCluster.Default.css",
```

- [ ] **Step 2: Manually verify offline map**

Run: `python3 -m http.server 8000`, load the app once online, then stop the server and reload from the installed PWA / with the tab offline. The map tiles won't load (they're remote by design) but Leaflet itself initializes and the app shell + markers render without errors in the console.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "chore: cache self-hosted leaflet for offline; bump sw cache"
```

---

### Task 13: Usability polish (legibility + colorblind-safe score)

Raises the smallest fonts and adds a non-color label to score signals.

**Files:**
- Modify: `source-app.jsx` (`scoreColor` companion, `Gauge`, `SeasonStrip`, `MiniStat` labels, default tab)

**Interfaces:**
- Produces: `scoreWord(v) => "Prime"|"Fair"|"Slow"` used alongside color.

- [ ] **Step 1: Add a score word helper**

Near `scoreColor` in `source-app.jsx`, add:
```js
function scoreWord(v){ return v>=70?"Prime":v>=45?"Fair":"Slow"; }
```

- [ ] **Step 2: Show the word under the opportunity gauge**

In `Gauge`, when a `label` is present, append the word. Change the label div to:
```js
{label&&<div style={{fontFamily:mono,fontSize:10,letterSpacing:1,textTransform:"uppercase",color:C.textDim}}>{label}</div>}
```
and in `RecCard`, under `<Gauge value={ev.opportunity} label="Opportunity"/>`, the score word is already conveyed by `ev.explanation`'s quality phrase; additionally set the honourable-mentions numeric score to carry a title attribute for screen readers by wrapping it:
```js
<span title={scoreWord(ev.opportunity)} style={{fontFamily:serif,fontSize:18,fontWeight:700,color:scoreColor(ev.opportunity),fontVariantNumeric:"tabular-nums",width:26}}>{ev.opportunity}</span>
```

- [ ] **Step 3: Raise the smallest fonts**

In `SeasonStrip`, change the month-letter `fontSize:7` to `fontSize:9`. In `ConditionsStrip`, change chip label `fontSize:9` to `fontSize:10`. In `Pill`, change `fontSize:10` to `fontSize:11`.

- [ ] **Step 4: Default to the Report tab**

In `App`, change `const [tab,setTab]=useState("map");` to `const [tab,setTab]=useState("today");` so first load shows the (connection-independent) report rather than the map.

- [ ] **Step 5: Build and manually verify**

Run: `npm run build`, reload. Confirm: app opens on Report; month letters and condition labels are noticeably more legible; hovering a score shows Prime/Fair/Slow.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: legibility bump + colorblind-safe score words; default to Report"
```

---

## Self-Review

**Spec coverage:**
- Discovery engine (Overpass, normalization, staged radius, caching) → Tasks 6, 9.
- Terrain/elevation → Task 7.
- Species inference + warmwater species → Tasks 2, 3.
- Habitat proxy + scoring adaptation w/ confidence penalty → Tasks 4, 8, 9.
- Weather batching → Task 10.
- Ranking merge + unified badged list → Task 9, 13.
- Google Maps deep links → Tasks 1, 11.
- Hiking (foot) route → Task 11.
- Reliability: endpoint fallback/retry → Task 5; self-hosted + cached Leaflet → Tasks 0, 12.
- UI usability (fonts, colorblind, footer copy, default tab, offline map state) → Tasks 1, 12, 13.
- Build prerequisite (esbuild) + Vitest → Task 0.
- Backend seam for streamflow → intentionally out of scope (spec "Out of scope"); no task, by design.

**Placeholder scan:** No TODO/TBD; every code step shows complete code; manual-verification steps list concrete checks.

**Type consistency:** `Spot` shape from `parseOverpassSpots` (`{id,name,lat,lon,waterType,isTailwater,kind}`) is consumed consistently in `discoverSecs`. Trait shape `{waterType,elevationM,nearGreatLakeKm,isTailwater}` is identical across `inferSpecies` and `deriveHabitat`. `route.walk` gains `coords/trail` fields used consistently in the draw effect and summary. `discoverSecs` return shape changes from `list` (Task 9) to `{list,wxUrl}` (Task 10) — Task 10 explicitly updates both the cache-return and `discoverNearby` call sites, so callers stay consistent after Task 10.
