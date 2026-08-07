# Production Foundation — Phase 3: Reliable Data Proxy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route discovery, parking, and routing through backend endpoints that proxy Overpass/OSRM with server-side caching, fallback endpoints, and retry — eliminating the user-visible 429s — and repoint the frontend to use them with a safe direct-API fallback so the app still works standalone.

**Architecture:** New Fastify `/api/discover`, `/api/parking`, `/api/route` endpoints backed by an in-memory TTL cache and a resilient fetch (ordered fallback hosts + retry/backoff). The frontend calls these when an `API_BASE` is configured, otherwise it keeps calling the public APIs directly (today's behavior).

**Tech Stack:** Fastify, Node global `fetch`, Vitest (backend); esbuild frontend.

## Global Constraints

- Backend proxy endpoints validate `lat`/`lon`/`radiusM` numerically and reject junk with 400 (no arbitrary Overpass queries from clients — prevents SSRF/abuse).
- Cache is keyed by rounded coordinates; discovery/parking TTL 7 days, routing TTL 1 day.
- Resilient fetch tries ordered hosts, retries each once with backoff, then fails cleanly.
- Frontend behavior is unchanged when `API_BASE` is empty (default); setting it routes through the proxy with a direct-API fallback on proxy failure.
- Proxy endpoints are **not** premium-gated yet (the frontend has no auth wiring until Phase D); the global rate limiter protects them. Gating is a one-line `preHandler` add later.

---

### Task 1: In-memory TTL cache (pure, TDD)

**Files:** Create `backend/src/proxy/cache.js`, `backend/src/proxy/cache.test.js`

**Interfaces:** Produces `makeCache()` → `{ get(key), set(key, value, ttlMs), size() }`. `get` returns `undefined` for missing/expired and evicts expired entries.

- [ ] **Step 1: Write the failing test**

`backend/src/proxy/cache.test.js`:
```js
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeCache } from "./cache.js";

describe("makeCache", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("returns a stored value before it expires", () => {
    const c = makeCache();
    c.set("k", { a: 1 }, 1000);
    expect(c.get("k")).toEqual({ a: 1 });
  });
  it("expires a value after its ttl", () => {
    const c = makeCache();
    c.set("k", 42, 1000);
    vi.advanceTimersByTime(1500);
    expect(c.get("k")).toBeUndefined();
    expect(c.size()).toBe(0);
  });
  it("returns undefined for a missing key", () => {
    expect(makeCache().get("nope")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npx vitest run src/proxy/cache.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`backend/src/proxy/cache.js`:
```js
export function makeCache() {
  const store = new Map();
  return {
    get(key) {
      const e = store.get(key);
      if (!e) return undefined;
      if (e.expiresAt < Date.now()) { store.delete(key); return undefined; }
      return e.value;
    },
    set(key, value, ttlMs) { store.set(key, { value, expiresAt: Date.now() + ttlMs }); },
    size() { return store.size; },
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && npx vitest run src/proxy/cache.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/faheemafridi/river-intel-pwa
git add backend/src/proxy/cache.js backend/src/proxy/cache.test.js && git commit -m "feat(backend): in-memory ttl cache for proxy"
```

---

### Task 2: Resilient fetch (pure, TDD)

**Files:** Create `backend/src/proxy/resilient-fetch.js`, `backend/src/proxy/resilient-fetch.test.js`

**Interfaces:** Produces `resilientFetch(urls, options = {}, { retries = 1, fetchImpl = fetch, backoffMs = 150 }) => Promise<Response>` — tries each URL, retries each on failure/non-ok, then advances; rejects if all fail.

- [ ] **Step 1: Write the failing test**

`backend/src/proxy/resilient-fetch.test.js`:
```js
import { describe, it, expect, vi } from "vitest";
import { resilientFetch } from "./resilient-fetch.js";

const ok = (b = "{}") => new Response(b, { status: 200 });
const bad = () => new Response("", { status: 502 });

describe("resilientFetch", () => {
  it("returns the first ok response", async () => {
    const f = vi.fn().mockResolvedValueOnce(ok("A"));
    const r = await resilientFetch(["u1", "u2"], {}, { retries: 0, fetchImpl: f, backoffMs: 0 });
    expect(await r.text()).toBe("A");
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("falls back to the next url", async () => {
    const f = vi.fn().mockResolvedValueOnce(bad()).mockResolvedValueOnce(ok("B"));
    const r = await resilientFetch(["u1", "u2"], {}, { retries: 0, fetchImpl: f, backoffMs: 0 });
    expect(await r.text()).toBe("B");
  });
  it("rejects when all fail", async () => {
    const f = vi.fn().mockResolvedValue(bad());
    await expect(resilientFetch(["u1", "u2"], {}, { retries: 0, fetchImpl: f, backoffMs: 0 })).rejects.toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npx vitest run src/proxy/resilient-fetch.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`backend/src/proxy/resilient-fetch.js`:
```js
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function resilientFetch(urls, options = {}, opts = {}) {
  const { retries = 1, fetchImpl = fetch, backoffMs = 150 } = opts;
  let lastErr = new Error("no urls");
  for (const url of urls) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetchImpl(url, options);
        if (res && res.ok) return res;
        lastErr = new Error("bad status " + (res && res.status));
      } catch (e) { lastErr = e; }
      if (attempt < retries) await sleep(backoffMs);
    }
  }
  throw lastErr;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && npx vitest run src/proxy/resilient-fetch.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/proxy/resilient-fetch.js backend/src/proxy/resilient-fetch.test.js && git commit -m "feat(backend): resilient fetch with fallback + retry"
```

---

### Task 3: Overpass query builders (pure, TDD)

**Files:** Create `backend/src/proxy/overpass.js`, `backend/src/proxy/overpass.test.js`

**Interfaces:** Produces `buildDiscoverQuery(lat, lon, radiusM)` and `buildParkingQuery(lat, lon)` returning Overpass QL strings. (Mirrors the frontend's query so the backend controls exactly what is fetched.)

- [ ] **Step 1: Write the failing test**

`backend/src/proxy/overpass.test.js`:
```js
import { describe, it, expect } from "vitest";
import { buildDiscoverQuery, buildParkingQuery } from "./overpass.js";

describe("overpass queries", () => {
  it("discover query targets access + named waterways in radius", () => {
    const q = buildDiscoverQuery(43.7, -80.3, 30000);
    expect(q).toContain('leisure"="fishing"');
    expect(q).toContain('waterway"="river"');
    expect(q).toContain("around:30000,43.7,-80.3");
    expect(q).toContain("out tags geom 200;");
  });
  it("parking query targets amenity=parking + slipway", () => {
    const q = buildParkingQuery(43.7, -80.3);
    expect(q).toContain('amenity"="parking"');
    expect(q).toContain('leisure"="slipway"');
    expect(q).toContain("around:1500,43.7,-80.3");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npx vitest run src/proxy/overpass.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`backend/src/proxy/overpass.js`:
```js
export function buildDiscoverQuery(lat, lon, radiusM) {
  const a = `around:${radiusM},${lat},${lon}`;
  return `[out:json][timeout:25];(` +
    `node["leisure"="fishing"](${a});` +
    `node["leisure"="slipway"](${a});` +
    `node["waterway"="dam"](${a});node["waterway"="weir"](${a});` +
    `way["waterway"="river"]["name"](${a});` +
    `way["waterway"="stream"]["name"](${a});` +
    `);out tags geom 200;`;
}
export function buildParkingQuery(lat, lon) {
  const a = `around:1500,${lat},${lon}`;
  return `[out:json][timeout:20];(` +
    `node["amenity"="parking"](${a});way["amenity"="parking"](${a});` +
    `node["leisure"="slipway"](${a});` +
    `);out center 25;`;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && npx vitest run src/proxy/overpass.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/proxy/overpass.js backend/src/proxy/overpass.test.js && git commit -m "feat(backend): overpass query builders"
```

---

### Task 4: Proxy routes (/api/discover, /api/parking, /api/route)

**Files:** Create `backend/src/proxy/hosts.js`, `backend/src/routes/proxy.js`, `backend/test/proxy.test.js`; Modify `backend/src/app.js`

**Interfaces:** Produces GET endpoints that validate params, fetch upstream via `resilientFetch` (injected as `app.proxyFetch` so tests can stub it), cache the JSON, and return it. Cache + fetch are attached to the app via a small plugin option for testability.

- [ ] **Step 1: Create the host lists**

`backend/src/proxy/hosts.js`:
```js
export const OVERPASS_HOSTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
export const OSRM_BASE = "https://router.project-osrm.org";
```

- [ ] **Step 2: Write the failing test (stubbed upstream)**

`backend/test/proxy.test.js`:
```js
import { describe, it, expect, vi } from "vitest";
import { buildApp } from "../src/app.js";

function stub(json) {
  return vi.fn().mockResolvedValue(new Response(JSON.stringify(json), { status: 200 }));
}

describe("proxy routes", () => {
  it("400s on bad coordinates", async () => {
    const app = buildApp({ proxyFetch: stub({ elements: [] }) });
    const res = await app.inject({ method: "GET", url: "/api/discover?lat=abc&lon=-80&radiusM=30000" });
    expect(res.statusCode).toBe(400);
  });

  it("discover returns upstream elements and caches (second call: no refetch)", async () => {
    const f = stub({ elements: [{ id: 1 }] });
    const app = buildApp({ proxyFetch: f });
    const url = "/api/discover?lat=43.7&lon=-80.3&radiusM=30000";
    const a = await app.inject({ method: "GET", url });
    expect(a.statusCode).toBe(200);
    expect(a.json().elements).toEqual([{ id: 1 }]);
    const b = await app.inject({ method: "GET", url });
    expect(b.json().elements).toEqual([{ id: 1 }]);
    expect(f).toHaveBeenCalledTimes(1); // cache hit on the second call
  });

  it("route validates profile and proxies OSRM", async () => {
    const f = stub({ code: "Ok", routes: [{ distance: 100, duration: 60, geometry: { coordinates: [] } }] });
    const app = buildApp({ proxyFetch: f });
    const ok = await app.inject({ method: "GET", url: "/api/route?profile=foot&from=-80.3,43.7&to=-80.31,43.71" });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().code).toBe("Ok");
    const bad = await app.inject({ method: "GET", url: "/api/route?profile=jetpack&from=-80.3,43.7&to=-80.31,43.71" });
    expect(bad.statusCode).toBe(400);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd backend && npx vitest run test/proxy.test.js`
Expected: FAIL — route not found / buildApp ignores option.

- [ ] **Step 4: Implement the proxy routes**

`backend/src/routes/proxy.js`:
```js
import { makeCache } from "../proxy/cache.js";
import { resilientFetch } from "../proxy/resilient-fetch.js";
import { OVERPASS_HOSTS, OSRM_BASE } from "../proxy/hosts.js";
import { buildDiscoverQuery, buildParkingQuery } from "../proxy/overpass.js";

const DAY = 864e5;
const num = (v) => (v === undefined || v === "" || isNaN(Number(v)) ? null : Number(v));
const r3 = (n) => Math.round(n * 1000) / 1000;

export default function proxyRoutes(proxyFetch = resilientFetch) {
  const cache = makeCache();

  async function overpass(query, key, ttl, reply) {
    const hit = cache.get(key);
    if (hit) return hit;
    let json;
    try {
      const res = await proxyFetch(OVERPASS_HOSTS,
        { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "data=" + encodeURIComponent(query) },
        { retries: 1 });
      json = await res.json();
    } catch { reply.code(502).send({ error: "upstream unavailable" }); return null; }
    cache.set(key, json, ttl);
    return json;
  }

  return async function (app) {
    app.get("/api/discover", async (req, reply) => {
      const lat = num(req.query.lat), lon = num(req.query.lon), radiusM = num(req.query.radiusM) || 30000;
      if (lat === null || lon === null) return reply.code(400).send({ error: "lat and lon required" });
      const key = `disc:${r3(lat)},${r3(lon)}:${radiusM}`;
      const json = await overpass(buildDiscoverQuery(lat, lon, radiusM), key, 7 * DAY, reply);
      if (json) return json;
    });

    app.get("/api/parking", async (req, reply) => {
      const lat = num(req.query.lat), lon = num(req.query.lon);
      if (lat === null || lon === null) return reply.code(400).send({ error: "lat and lon required" });
      const key = `park:${r3(lat)},${r3(lon)}`;
      const json = await overpass(buildParkingQuery(lat, lon), key, 7 * DAY, reply);
      if (json) return json;
    });

    app.get("/api/route", async (req, reply) => {
      const profile = req.query.profile === "foot" ? "foot" : req.query.profile === "driving" ? "driving" : null;
      if (!profile) return reply.code(400).send({ error: "profile must be driving or foot" });
      const from = String(req.query.from || ""), to = String(req.query.to || "");
      if (!/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(from) || !/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(to))
        return reply.code(400).send({ error: "from/to must be lon,lat" });
      const key = `route:${profile}:${from};${to}`;
      const hit = cache.get(key);
      if (hit) return hit;
      let json;
      try {
        const url = `${OSRM_BASE}/route/v1/${profile}/${from};${to}?overview=full&geometries=geojson`;
        const res = await proxyFetch([url], {}, { retries: 1 });
        json = await res.json();
      } catch { return reply.code(502).send({ error: "routing unavailable" }); }
      cache.set(key, json, DAY);
      return json;
    });
  };
}
```

- [ ] **Step 5: Wire an optional `proxyFetch` into `buildApp` and register**

In `backend/src/app.js`:
- Change the signature to `export function buildApp(opts = {}) {`
- Add import: `import proxyRoutes from "./routes/proxy.js";`
- Register (near other routes): `app.register(proxyRoutes(opts.proxyFetch));`

- [ ] **Step 6: Run to verify it passes**

Run: `cd backend && npx vitest run test/proxy.test.js`
Expected: PASS (3 tests).

- [ ] **Step 7: Full backend suite (nothing regressed)**

Run: `cd backend && npm test`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add backend/src && git commit -m "feat(backend): /api/discover, /api/parking, /api/route proxy with caching"
```

---

### Task 5: Repoint the frontend through the proxy (with direct fallback)

**Files:** Modify `source-app.jsx` (add `API_BASE`; route `discoverSecs`, `fetchParking`, `fetchDriveRoute`, `fetchFootRoute` through the proxy when configured)

**Interfaces:** Consumes the Task 4 endpoints. Behavior unchanged when `API_BASE` is empty.

- [ ] **Step 1: Add the API base + a proxy helper**

Near the top of `source-app.jsx` (after the imports), add:
```js
const API_BASE = (typeof window !== "undefined" && window.MUDDY_API_BASE) || "";
async function proxyJSON(path){ const r = await fetch(API_BASE + path); if(!r.ok) throw new Error("proxy "+r.status); return r.json(); }
```

- [ ] **Step 2: Route discovery through the proxy**

In `discoverSecs`, replace the Overpass fetch block:
```js
  let json;
  try{
    const res=await fetchWithFallback(OVERPASS_HOSTS, {method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body}, {retries:1});
    json=await res.json();
  }catch(e){ return null; }
```
with:
```js
  let json;
  try{
    if(API_BASE){ json = await proxyJSON(`/api/discover?lat=${loc.lat}&lon=${loc.lon}&radiusM=${radiusM}`); }
    else { const res=await fetchWithFallback(OVERPASS_HOSTS, {method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body}, {retries:1}); json=await res.json(); }
  }catch(e){
    try{ const res=await fetchWithFallback(OVERPASS_HOSTS, {method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body}, {retries:1}); json=await res.json(); }
    catch(e2){ return null; }
  }
```

- [ ] **Step 3: Route parking through the proxy**

In `fetchParking`, wrap the Overpass call: before the existing direct fetch, add:
```js
  if(API_BASE){
    try{ const d=await proxyJSON(`/api/parking?lat=${lat}&lon=${lon}`);
      const list=(d.elements||[]).map(e=>{ const la=e.lat!=null?e.lat:(e.center&&e.center.lat), lo=e.lon!=null?e.lon:(e.center&&e.center.lon); if(la==null) return null; const tg=e.tags||{}; const type=tg.leisure==="slipway"?"Boat launch":(tg.parking?tg.parking.replace(/_/g," "):"parking"); return {id:""+e.type+e.id,lat:la,lon:lo,name:tg.name||null,type,fee:tg.fee||null,access:tg.access||null}; }).filter(Boolean);
      try{ await dbSet(key,{ts:Date.now(),list}); }catch(e){}
      return list;
    }catch(e){ /* fall through to direct */ }
  }
```

- [ ] **Step 4: Route driving + foot routes through the proxy**

In `fetchDriveRoute`, at the top of the `try`, add a proxy branch:
```js
    if(API_BASE){ const d=await proxyJSON(`/api/route?profile=driving&from=${from.lon},${from.lat}&to=${to.lon},${to.lat}`);
      const rt=d.routes&&d.routes[0]; if(!rt) return null;
      return { coords: rt.geometry.coordinates.map(c=>[c[1],c[0]]), distKm:+(rt.distance/1000).toFixed(1), durMin:Math.round(rt.duration/60) }; }
```
In `fetchFootRoute`, similarly at the top of the `try`:
```js
    if(API_BASE){ const d=await proxyJSON(`/api/route?profile=foot&from=${from.lon},${from.lat}&to=${to.lon},${to.lat}`);
      const rt=d.routes&&d.routes[0]; if(!rt) return null;
      return { coords: rt.geometry.coordinates.map(c=>[c[1],c[0]]), distKm:+(rt.distance/1000).toFixed(2), durMin:Math.round(rt.duration/60) }; }
```

- [ ] **Step 5: Build and verify (default behavior unchanged)**

Run: `cd /Users/faheemafridi/river-intel-pwa && npm run build && npm test`
Expected: `built app.js`, 24/24 tests pass (no `API_BASE` set → direct path, unchanged).

- [ ] **Step 6: End-to-end proxy check (local)**

Start the backend (`cd backend && npm run dev`), serve the frontend, and in the browser console set `window.MUDDY_API_BASE = "http://localhost:3000"` then reload and run "Find water near me". Discovery now flows through the proxy (watch the backend logs); a second search for the same area is served from cache (no upstream call).

- [ ] **Step 7: Commit**

```bash
git add source-app.jsx app.js && git commit -m "feat(frontend): route discovery/parking/routing through backend proxy with direct fallback"
```

---

### Task 6: Phase wrap

- [ ] **Step 1: Full backend + frontend suites**

Run: `cd backend && npm test` then `cd /Users/faheemafridi/river-intel-pwa && npm run build && npm test`
Expected: backend all green; frontend 24/24.

- [ ] **Step 2: Tag the phase**

```bash
git commit --allow-empty -m "chore: B phase 3 (reliable data proxy) complete"
```

---

## Self-Review

**Spec coverage (Phase 3 of B):** server-side proxy of Overpass (discover, parking) + OSRM (route) with caching (Tasks 1, 4), fallback endpoints + retry (Task 2), query builders controlling upstream requests (Task 3), and the frontend repoint with a direct fallback (Task 5). Measured-conditions and alerts are later phases.

**Placeholder scan:** no TBD/TODO; every code step is complete. No `⚙️ YOU PROVIDE` items — Phase 3 uses only the same public APIs, so it is fully buildable and testable here (upstream stubbed in tests; real end-to-end is the optional local check in Task 5 Step 6).

**Type/name consistency:** `makeCache().get/set/size` used consistently in `proxy.js` and tests. `resilientFetch(urls, options, opts)` signature matches its callers and the injected `proxyFetch` stub. `buildApp(opts)` gains an optional `proxyFetch` used only by `proxyRoutes(opts.proxyFetch)`; existing callers (`server.js`, other tests) pass no args and are unaffected. Frontend `proxyJSON`/`API_BASE` gate every upstream call and fall back to the existing direct paths.
