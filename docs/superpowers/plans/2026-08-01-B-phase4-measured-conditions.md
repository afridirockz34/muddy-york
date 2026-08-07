# Production Foundation — Phase 4: Measured Conditions (Water Survey of Canada) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface real measured streamflow (discharge) + water level from the nearest Water Survey of Canada gauge through a backend `/api/conditions` endpoint, and show it in the spot detail as a clearly-labeled "measured" readout alongside the modeled conditions.

**Architecture:** New pure parsers over the MSC GeoMet `hydrometric-realtime` GeoJSON, a cached `/api/conditions` proxy endpoint (reuses Phase-3 cache + resilient fetch), and a small frontend readout fetched through the proxy when `API_BASE` is set.

**Tech Stack:** MSC GeoMet OGC API (`api.weather.gc.ca`, keyless), Fastify, Vitest, esbuild frontend.

## Global Constraints

- **WSC real-time provides discharge (m³/s) + level (m), NOT water temperature** — so water temp stays modeled; this phase adds measured *flow*. Copy stays honest about that.
- `/api/conditions` validates `lat`/`lon` (400 on junk); cache TTL 1 hour (data is real-time).
- Dedupe observations to the latest per station; only surface a gauge within 40 km; include the observation timestamp so staleness is visible.
- Frontend shows measured data only when it exists; no `API_BASE`/no gauge → nothing rendered (graceful), modeled conditions unchanged.
- No `⚙️ YOU PROVIDE` — the API is open; fully buildable and testable here.

---

### Task 1: Hydrometric parsers (pure, TDD)

**Files:** Create `backend/src/proxy/hydrometric.js`, `backend/src/proxy/hydrometric.test.js`

**Interfaces:**
- `buildHydroUrl(lat, lon, halfDeg = 0.3) => string` — MSC GeoMet bbox URL, latest-first.
- `parseGauges(geojson, loc) => Gauge[]` where `Gauge = { stationNumber, name, lat, lon, discharge, level, observedAt, distanceKm }`, latest-per-station, discharge present, nearest first.
- `nearestGauge(geojson, loc, maxKm = 40) => Gauge | null`.

- [ ] **Step 1: Write the failing test**

`backend/src/proxy/hydrometric.test.js`:
```js
import { describe, it, expect } from "vitest";
import { buildHydroUrl, parseGauges, nearestGauge } from "./hydrometric.js";

const feat = (num, name, lon, lat, disch, level, dt) => ({
  type: "Feature", geometry: { type: "Point", coordinates: [lon, lat] },
  properties: { STATION_NUMBER: num, STATION_NAME: name, DISCHARGE: disch, LEVEL: level, DATETIME: dt },
});
const loc = { lat: 43.78, lon: -80.0 };

describe("buildHydroUrl", () => {
  it("builds a bbox url, latest first, json", () => {
    const u = buildHydroUrl(43.78, -80.0, 0.3);
    expect(u).toContain("hydrometric-realtime/items");
    expect(u).toContain("bbox=-80.3,43.48,-79.7,44.08");
    expect(u).toContain("sortby=-DATETIME");
    expect(u).toContain("f=json");
  });
});

describe("parseGauges", () => {
  it("keeps the latest reading per station and sorts by distance", () => {
    const geojson = { features: [
      feat("A", "Near River", -80.0, 43.79, 1.0, 2.0, "2026-08-07T12:00:00Z"),
      feat("A", "Near River", -80.0, 43.79, 9.9, 2.9, "2026-08-07T12:20:00Z"), // newer
      feat("B", "Far River", -80.4, 44.2, 5.0, 1.0, "2026-08-07T12:20:00Z"),
    ] };
    const g = parseGauges(geojson, loc);
    expect(g).toHaveLength(2);
    expect(g[0].stationNumber).toBe("A");       // nearest
    expect(g[0].discharge).toBe(9.9);            // latest reading
    expect(g[0].distanceKm).toBeLessThan(g[1].distanceKm);
  });
  it("drops rows with no discharge", () => {
    const geojson = { features: [ feat("C", "No Flow", -80.0, 43.78, null, 2.0, "2026-08-07T12:00:00Z") ] };
    expect(parseGauges(geojson, loc)).toHaveLength(0);
  });
});

describe("nearestGauge", () => {
  it("returns null when the closest gauge is beyond maxKm", () => {
    const geojson = { features: [ feat("D", "Way Off", -83.0, 46.0, 3.0, 1.0, "2026-08-07T12:00:00Z") ] };
    expect(nearestGauge(geojson, loc, 40)).toBe(null);
  });
  it("returns the nearest within range", () => {
    const geojson = { features: [ feat("E", "Close", -80.01, 43.79, 3.0, 1.0, "2026-08-07T12:00:00Z") ] };
    expect(nearestGauge(geojson, loc, 40).stationNumber).toBe("E");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npx vitest run src/proxy/hydrometric.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`backend/src/proxy/hydrometric.js`:
```js
const R = 6371, toR = (x) => (x * Math.PI) / 180;
function km(a, b, c, d) {
  const dLa = toR(c - a), dLo = toR(d - b);
  const s = Math.sin(dLa / 2) ** 2 + Math.cos(toR(a)) * Math.cos(toR(c)) * Math.sin(dLo / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}
const f4 = (n) => Math.round(n * 100) / 100;

export function buildHydroUrl(lat, lon, halfDeg = 0.3) {
  const bbox = `${f4(lon - halfDeg)},${f4(lat - halfDeg)},${f4(lon + halfDeg)},${f4(lat + halfDeg)}`;
  return `https://api.weather.gc.ca/collections/hydrometric-realtime/items?bbox=${bbox}&sortby=-DATETIME&limit=200&f=json`;
}

export function parseGauges(geojson, loc) {
  const feats = (geojson && geojson.features) || [];
  const byStation = new Map();
  for (const f of feats) {
    const p = f.properties || {}, coords = (f.geometry && f.geometry.coordinates) || [];
    const lon = coords[0], lat = coords[1];
    if (lat == null || p.DISCHARGE == null) continue;
    const cur = byStation.get(p.STATION_NUMBER);
    if (!cur || new Date(p.DATETIME).getTime() > new Date(cur.observedAt).getTime()) {
      byStation.set(p.STATION_NUMBER, {
        stationNumber: p.STATION_NUMBER,
        name: p.STATION_NAME || p.STATION_NUMBER,
        lat, lon,
        discharge: p.DISCHARGE,
        level: p.LEVEL != null ? p.LEVEL : null,
        observedAt: p.DATETIME,
      });
    }
  }
  return [...byStation.values()]
    .map((s) => ({ ...s, distanceKm: +km(loc.lat, loc.lon, s.lat, s.lon).toFixed(1) }))
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

export function nearestGauge(geojson, loc, maxKm = 40) {
  const list = parseGauges(geojson, loc);
  return list.length && list[0].distanceKm <= maxKm ? list[0] : null;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && npx vitest run src/proxy/hydrometric.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/faheemafridi/river-intel-pwa
git add backend/src/proxy/hydrometric.js backend/src/proxy/hydrometric.test.js && git commit -m "feat(backend): WSC hydrometric parsers (nearest gauge)"
```

---

### Task 2: `/api/conditions` endpoint

**Files:** Modify `backend/src/routes/proxy.js`, `backend/test/proxy.test.js`

**Interfaces:** `GET /api/conditions?lat&lon` → `{ gauge: Gauge | null }`, cached 1h; 400 on bad coords; 502 on upstream failure.

- [ ] **Step 1: Write the failing test**

Append to `backend/test/proxy.test.js`:
```js
import { buildHydroUrl } from "../src/proxy/hydrometric.js";

describe("conditions route", () => {
  const feat = (num, lon, lat, disch, dt) => ({
    geometry: { type: "Point", coordinates: [lon, lat] },
    properties: { STATION_NUMBER: num, STATION_NAME: num, DISCHARGE: disch, LEVEL: 1, DATETIME: dt },
  });

  it("400s on bad coords", async () => {
    const app = buildApp({ proxyFetch: stub({ features: [] }) });
    const res = await app.inject({ method: "GET", url: "/api/conditions?lat=x&lon=-80" });
    expect(res.statusCode).toBe(400);
  });

  it("returns the nearest gauge and caches", async () => {
    const f = stub({ features: [ feat("Z", -80.01, 43.79, 4.2, "2026-08-07T12:00:00Z") ] });
    const app = buildApp({ proxyFetch: f });
    const url = "/api/conditions?lat=43.78&lon=-80.0";
    const a = await app.inject({ method: "GET", url });
    expect(a.statusCode).toBe(200);
    expect(a.json().gauge.stationNumber).toBe("Z");
    expect(a.json().gauge.discharge).toBe(4.2);
    await app.inject({ method: "GET", url });
    expect(f).toHaveBeenCalledTimes(1); // cached
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npx vitest run test/proxy.test.js`
Expected: FAIL — `/api/conditions` not found.

- [ ] **Step 3: Implement**

In `backend/src/routes/proxy.js`:
- Add import: `import { buildHydroUrl, nearestGauge } from "../proxy/hydrometric.js";`
- Add this route inside the returned `async function (app)` block:
```js
    app.get("/api/conditions", async (req, reply) => {
      const lat = num(req.query.lat), lon = num(req.query.lon);
      if (lat === null || lon === null) return reply.code(400).send({ error: "lat and lon required" });
      const key = `cond:${r3(lat)},${r3(lon)}`;
      const hit = cache.get(key);
      if (hit) return hit;
      let geojson;
      try {
        const res = await proxyFetch([buildHydroUrl(lat, lon)], {}, { retries: 1 });
        geojson = await res.json();
      } catch { return reply.code(502).send({ error: "gauge data unavailable" }); }
      const payload = { gauge: nearestGauge(geojson, { lat, lon }) };
      cache.set(key, payload, 60 * 60 * 1000);
      return payload;
    });
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && npx vitest run test/proxy.test.js`
Expected: PASS (all proxy tests incl. conditions).

- [ ] **Step 5: Full backend suite + live check**

Run: `cd backend && npm test` (all green). Then live:
```bash
npm run dev &
curl -s "http://localhost:3000/api/conditions?lat=43.78&lon=-80.0" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).gauge))"
```
Expected: a real nearby gauge object (station name, discharge, level, distanceKm, observedAt). Stop the server after.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/proxy.js backend/test/proxy.test.js && git commit -m "feat(backend): /api/conditions measured gauge endpoint"
```

---

### Task 3: Frontend measured-gauge readout

**Files:** Modify `source-app.jsx` (add a `MeasuredGauge` component; render it in the MapView selected-spot card)

**Interfaces:** Consumes `GET /api/conditions`. Renders only when `API_BASE` is set and a gauge is returned.

- [ ] **Step 1: Add the component**

In `source-app.jsx`, add near the other small components (e.g. after `ConditionsStrip`):
```js
function MeasuredGauge({ lat, lon }) {
  const [g, setG] = useState(undefined); // undefined=loading | null=none | object
  useEffect(() => {
    if (!API_BASE) { setG(null); return; }
    let live = true; setG(undefined);
    proxyJSON(`/api/conditions?lat=${lat}&lon=${lon}`)
      .then(d => { if (live) setG(d.gauge || null); })
      .catch(() => { if (live) setG(null); });
    return () => { live = false; };
  }, [lat, lon]);
  if (!g) return null;
  const when = new Date(g.observedAt);
  const ago = Math.max(0, Math.round((Date.now() - when.getTime()) / 3600000));
  return (
    <div style={{marginTop:10,padding:"8px 11px",background:`${C.cyanDeep}12`,border:`1px solid ${C.cyanDeep}33`,borderRadius:8,fontSize:12,color:C.text,lineHeight:1.45}}>
      <span style={{fontFamily:sans,fontSize:9,letterSpacing:1,textTransform:"uppercase",fontWeight:700,color:C.pine}}>Measured · nearest gauge</span>
      <div style={{marginTop:3}}><b>{g.name}</b> · {g.distanceKm} km</div>
      <div style={{marginTop:2}}>Flow <b>{g.discharge} m³/s</b>{g.level!=null?<> · level <b>{g.level} m</b></>:null} <span style={{color:C.textFaint}}>· {ago===0?"just now":`${ago} h ago`}</span></div>
      <div style={{fontFamily:sans,fontSize:9.5,color:C.textFaint,marginTop:3}}>Live reading from Water Survey of Canada. Water temperature remains modeled.</div>
    </div>
  );
}
```

- [ ] **Step 2: Render it in the selected-spot card**

In `MapView`, in the selected-spot panel (`ev && (...)`), after `<ConditionsStrip cond={ev.cond}/>`, add:
```js
      <MeasuredGauge lat={ev.sec.lat} lon={ev.sec.lon}/>
```

- [ ] **Step 3: Build + frontend tests**

Run: `cd /Users/faheemafridi/river-intel-pwa && npm run build && npm test`
Expected: `built app.js`, 24/24 pass (no `API_BASE` → component renders nothing).

- [ ] **Step 4: End-to-end (local, optional)**

Start the backend, serve the frontend, set `window.MUDDY_API_BASE="http://localhost:3000"`, open a spot on the map — a "Measured · nearest gauge" panel shows real discharge from the closest WSC station.

- [ ] **Step 5: Commit**

```bash
git add source-app.jsx app.js && git commit -m "feat(frontend): measured gauge readout in spot detail"
```

---

### Task 4: Phase wrap

- [ ] **Step 1: Full suites**

Run: `cd backend && npm test` then `cd /Users/faheemafridi/river-intel-pwa && npm run build && npm test`
Expected: backend all green; frontend 24/24.

- [ ] **Step 2: Tag the phase**

```bash
git commit --allow-empty -m "chore: B phase 4 (measured conditions) complete"
```

---

## Self-Review

**Spec coverage (Phase 4 of B):** measured streamflow from the nearest WSC gauge via a cached `/api/conditions` endpoint (Tasks 1–2) and a labeled measured readout in the UI (Task 3). Deviation from spec, documented: WSC real-time has **no water temperature**, so temp stays modeled — the phase delivers measured *flow/level*, honestly labeled.

**Placeholder scan:** no TBD/TODO; complete code throughout. No `⚙️ YOU PROVIDE` items (open API). Live checks (Task 2 Step 5, Task 3 Step 4) exercise the real endpoint.

**Type/name consistency:** `Gauge` shape from `parseGauges` (`stationNumber/name/lat/lon/discharge/level/observedAt/distanceKm`) is what `/api/conditions` returns as `{ gauge }` and what `MeasuredGauge` renders. `buildHydroUrl`/`nearestGauge` signatures match their callers. Reuses Phase-3 `cache`, `num`, `r3`, and the injected `proxyFetch` already in `proxy.js`. Frontend `proxyJSON`/`API_BASE` (from Phase 3) gate the fetch.
