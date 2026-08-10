# Phase E — Depth & Fish Intelligence — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Estimate deeper holding water (rivers via a morphology model, lakes via real sounded bathymetry) and likely fish (species + size/age), shown in the spot detail as a clearly-labelled estimate.

**Architecture:** New pure `lib/` models (`holding-water`, `fish-estimate`, plus bathymetry/stocking parsers) + two cached backend proxy endpoints (`/api/bathymetry`, `/api/stocking`) reusing the Phase-3 proxy. Frontend renders a "Depth & likely fish" panel on spot open. All pure logic is unit-tested; endpoints are live-verified.

**Tech Stack:** Ontario LIO ArcGIS REST (keyless), Fastify proxy, Vitest, esbuild frontend.

## Global Constraints

- **River-first:** rivers use the holding-water model; lakes/ponds use LIO bathymetry; LIO bathymetry overrides the river model where it covers the channel.
- Verified endpoint (bathymetry): `https://ws.lioservices.lrc.gov.on.ca/arcgis2/rest/services/LIO_OPEN_DATA/LIO_Open01/MapServer/30` (has `DEPTH`, bbox-queryable, keyless; depths are negative = metres below surface).
- Everything is an **Estimate** in the UI; nothing presented as certainty.
- Graceful degradation: missing data → "no depth data here"; models fall back to habitat-only.
- Reuse Phase-3 `resilientFetch`, `makeCache`, `num`, `r3` in `backend/src/routes/proxy.js`.

---

### Task 1: Bathymetry parser (pure, TDD)

**Files:** Create `lib/bathymetry.js`, `lib/bathymetry.test.js`

**Interfaces:** `buildBathyUrl(lat, lon, halfDeg=0.02) => string`; `parseBathy(arcgisJson) => { maxDepthM, contourCount, deepHole } | null` (deepest contour → maxDepthM as a positive number; `deepHole` when `maxDepthM >= 6`).

- [ ] **Step 1: Failing test** `lib/bathymetry.test.js`:
```js
import { describe, it, expect } from "vitest";
import { buildBathyUrl, parseBathy } from "./bathymetry.js";
describe("bathymetry", () => {
  it("builds a bbox query with DEPTH", () => {
    const u = buildBathyUrl(44.4, -79.5, 0.02);
    expect(u).toContain("MapServer/30/query");
    expect(u).toContain("outFields=DEPTH");
    expect(u).toContain("-79.52,44.38,-79.48,44.42");
  });
  it("returns positive max depth + deepHole", () => {
    const json = { features: [{ attributes:{DEPTH:-2} },{ attributes:{DEPTH:-29} },{ attributes:{DEPTH:-5} }] };
    const r = parseBathy(json);
    expect(r.maxDepthM).toBe(29);
    expect(r.contourCount).toBe(3);
    expect(r.deepHole).toBe(true);
  });
  it("null when no contours", () => { expect(parseBathy({ features: [] })).toBe(null); });
});
```

- [ ] **Step 2:** Run `npx vitest run lib/bathymetry.test.js` → FAIL.

- [ ] **Step 3: Implement** `lib/bathymetry.js`:
```js
const f = (n) => Math.round(n * 1000) / 1000;
export function buildBathyUrl(lat, lon, halfDeg = 0.02) {
  const bbox = `${f(lon - halfDeg)},${f(lat - halfDeg)},${f(lon + halfDeg)},${f(lat + halfDeg)}`;
  return `https://ws.lioservices.lrc.gov.on.ca/arcgis2/rest/services/LIO_OPEN_DATA/LIO_Open01/MapServer/30/query` +
    `?geometry=${bbox}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects` +
    `&outFields=DEPTH&returnGeometry=false&f=json&resultRecordCount=2000`;
}
export function parseBathy(json) {
  const feats = (json && json.features) || [];
  const depths = feats.map((x) => x.attributes && x.attributes.DEPTH).filter((d) => d != null).map((d) => Math.abs(d));
  if (!depths.length) return null;
  const maxDepthM = Math.round(Math.max(...depths) * 10) / 10;
  return { maxDepthM, contourCount: depths.length, deepHole: maxDepthM >= 6 };
}
```

- [ ] **Step 4:** Run → PASS (3 tests).
- [ ] **Step 5: Commit** `git add lib/bathymetry.js lib/bathymetry.test.js && git commit -m "feat: LIO bathymetry parser"`

---

### Task 2: River holding-water model (pure, TDD)

**Files:** Create `lib/holding-water.js`, `lib/holding-water.test.js`

**Interfaces:** `holdingWater(reach) => { poolScore, class, deepHole, drivers }` where `reach = { isTailwater, waterType, gradientPct, sinuosity, nearConfluence, belowLake, soundedMaxDepthM }`. `class ∈ {"riffle","run","pool","deep-pool"}`. If `soundedMaxDepthM` is present it takes precedence (measured overrides modelled).

- [ ] **Step 1: Failing test** `lib/holding-water.test.js`:
```js
import { describe, it, expect } from "vitest";
import { holdingWater } from "./holding-water.js";
describe("holdingWater", () => {
  it("tailwater + low gradient + confluence => deep pool, high score", () => {
    const r = holdingWater({ isTailwater:true, waterType:"river", gradientPct:0.1, sinuosity:1.4, nearConfluence:true, belowLake:false });
    expect(r.poolScore).toBeGreaterThan(65);
    expect(["pool","deep-pool"]).toContain(r.class);
    expect(r.deepHole).toBe(true);
    expect(r.drivers.length).toBeGreaterThan(0);
  });
  it("steep straight stream => riffle, low score", () => {
    const r = holdingWater({ isTailwater:false, waterType:"stream", gradientPct:3.5, sinuosity:1.02, nearConfluence:false, belowLake:false });
    expect(r.poolScore).toBeLessThan(40);
    expect(r.class).toBe("riffle");
  });
  it("sounded depth overrides the model", () => {
    const r = holdingWater({ isTailwater:false, waterType:"river", gradientPct:2, sinuosity:1, nearConfluence:false, belowLake:false, soundedMaxDepthM:8 });
    expect(r.deepHole).toBe(true);
    expect(r.class).toBe("deep-pool");
    expect(r.drivers).toContain("sounded depth 8 m");
  });
});
```

- [ ] **Step 2:** Run → FAIL.

- [ ] **Step 3: Implement** `lib/holding-water.js`:
```js
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
export function holdingWater(reach) {
  const { isTailwater, waterType, gradientPct=1, sinuosity=1, nearConfluence, belowLake, soundedMaxDepthM } = reach || {};
  const drivers = [];
  if (soundedMaxDepthM != null) {
    drivers.push(`sounded depth ${soundedMaxDepthM} m`);
    const cls = soundedMaxDepthM >= 6 ? "deep-pool" : soundedMaxDepthM >= 3 ? "pool" : soundedMaxDepthM >= 1.2 ? "run" : "riffle";
    return { poolScore: clamp(Math.round(40 + soundedMaxDepthM * 7), 0, 100), class: cls, deepHole: soundedMaxDepthM >= 6, drivers };
  }
  let s = 30;
  if (isTailwater) { s += 28; drivers.push("tailwater plunge pool below a dam"); }
  if (nearConfluence) { s += 16; drivers.push("scour hole at a confluence"); }
  if (belowLake) { s += 10; drivers.push("deeper flow below a lake"); }
  // low gradient = slower, deeper pools; steep = riffles
  if (gradientPct <= 0.3) { s += 18; drivers.push("low-gradient slow water"); }
  else if (gradientPct >= 2.5) { s -= 18; drivers.push("steep riffle water"); }
  // sinuosity = outer-bend undercuts
  if (sinuosity >= 1.3) { s += 12; drivers.push("meander bends with undercut banks"); }
  if (waterType === "river") s += 6; else if (waterType === "stream") s -= 4;
  const poolScore = clamp(Math.round(s), 0, 100);
  const cls = poolScore >= 72 ? "deep-pool" : poolScore >= 55 ? "pool" : poolScore >= 40 ? "run" : "riffle";
  return { poolScore, class: cls, deepHole: poolScore >= 72, drivers };
}
```

- [ ] **Step 4:** Run → PASS (3 tests).
- [ ] **Step 5: Commit** `git add lib/holding-water.js lib/holding-water.test.js && git commit -m "feat: river holding-water model"`

---

### Task 3: Fish estimate model (pure, TDD)

**Files:** Create `lib/fish-estimate.js`, `lib/fish-estimate.test.js`

**Interfaces:** `estimateFish({ species, holding, stocking, coldRetention, month }) => { species:[{key,likelihood}], sizeClass, ageEstimate, rationale }`. `sizeClass ∈ {"small","mixed","larger"}`. `species` in = inferred keys; `stocking` = `{ species?, yearsAgo? }|null`; `holding` = holding-water result; `coldRetention` 0–100.

- [ ] **Step 1: Failing test** `lib/fish-estimate.test.js`:
```js
import { describe, it, expect } from "vitest";
import { estimateFish } from "./fish-estimate.js";
const deep = { poolScore: 80, class: "deep-pool", deepHole: true, drivers: ["tailwater plunge pool"] };
const riffle = { poolScore: 30, class: "riffle", deepHole: false, drivers: [] };
describe("estimateFish", () => {
  it("deep cold pool + older stocking => larger fish, age noted", () => {
    const r = estimateFish({ species:["BNT"], holding:deep, stocking:{species:"Brown trout",yearsAgo:4}, coldRetention:90, month:4 });
    expect(r.sizeClass).toBe("larger");
    expect(r.ageEstimate).toMatch(/yr|year/);
    expect(r.rationale.join(" ")).toMatch(/deep|hold|stock/i);
  });
  it("shallow warm riffle => small/young", () => {
    const r = estimateFish({ species:["BKT"], holding:riffle, stocking:null, coldRetention:30, month:7 });
    expect(r.sizeClass).toBe("small");
  });
  it("stocked species is surfaced first", () => {
    const r = estimateFish({ species:["RBT"], holding:deep, stocking:{species:"Brown trout",yearsAgo:2}, coldRetention:80, month:5 });
    expect(r.species[0].key).toBeTruthy();
  });
});
```

- [ ] **Step 2:** Run → FAIL.

- [ ] **Step 3: Implement** `lib/fish-estimate.js`:
```js
export function estimateFish({ species = [], holding, stocking, coldRetention = 60, month } = {}) {
  const list = species.map((k, i) => ({ key: k, likelihood: Math.max(20, 85 - i * 18) }));
  if (stocking && stocking.species) list.unshift({ key: stocking.species, likelihood: 90 });
  const deep = holding && (holding.deepHole || holding.poolScore >= 65);
  const cold = coldRetention >= 65;
  let sizeClass = "mixed";
  if (deep && cold) sizeClass = "larger";
  else if (!deep && coldRetention < 45) sizeClass = "small";
  const rationale = [];
  if (holding && holding.drivers) rationale.push(...holding.drivers);
  if (cold) rationale.push("cold-water hold favours bigger, older fish");
  let ageEstimate = "mixed year-classes";
  if (stocking && stocking.yearsAgo != null) {
    const y = stocking.yearsAgo;
    ageEstimate = deep ? `holdover fish ~${Math.max(1, y - 1)}–${y + 1} yrs plausible` : `mostly ~${y} yr fish`;
    rationale.push(`stocked ~${y} yr ago`);
  } else if (deep && cold) {
    ageEstimate = "holdover / larger fish plausible";
  }
  return { species: list.slice(0, 4), sizeClass, ageEstimate, rationale };
}
```

- [ ] **Step 4:** Run → PASS (3 tests).
- [ ] **Step 5: Commit** `git add lib/fish-estimate.js lib/fish-estimate.test.js && git commit -m "feat: fish size/age estimate model"`

---

### Task 4: Stocking parser (pure, TDD) + endpoint pinning

**Files:** Create `lib/stocking.js`, `lib/stocking.test.js`

**Interfaces:** `parseStocking(arcgisJson, loc, nowYear) => { events:[{species,stage,year,yearsAgo,distanceKm}], nearestKm } | null` — expects features with `attributes` including a species field, a year/date field, and geometry (point). Field names are normalised defensively (`SPECIES|COMMON_NAME|FISH_SPECIES`, `STOCK_YEAR|YEAR|SPAWN_YEAR`, `DEVELOPMENT_STAGE|STAGE`).

- [ ] **Step 1: Failing test** `lib/stocking.test.js`:
```js
import { describe, it, expect } from "vitest";
import { parseStocking } from "./stocking.js";
const loc = { lat: 43.7, lon: -80.0 };
const feat = (sp, yr, lon, lat) => ({ attributes:{ SPECIES:sp, STOCK_YEAR:yr, DEVELOPMENT_STAGE:"Yearling" }, geometry:{ x:lon, y:lat } });
describe("parseStocking", () => {
  it("returns nearest-first events with yearsAgo", () => {
    const json = { features:[ feat("Brown Trout",2022,-80.01,43.71), feat("Rainbow Trout",2020,-80.3,44.0) ] };
    const r = parseStocking(json, loc, 2026);
    expect(r.events[0].species).toBe("Brown Trout");
    expect(r.events[0].yearsAgo).toBe(4);
    expect(r.events[0].distanceKm).toBeLessThan(r.events[1].distanceKm);
  });
  it("null on empty", () => { expect(parseStocking({ features: [] }, loc, 2026)).toBe(null); });
});
```

- [ ] **Step 2:** Run → FAIL.

- [ ] **Step 3: Implement** `lib/stocking.js`:
```js
const R=6371,toR=x=>x*Math.PI/180;
function km(a,b,c,d){const dLa=toR(c-a),dLo=toR(d-b);const s=Math.sin(dLa/2)**2+Math.cos(toR(a))*Math.cos(toR(c))*Math.sin(dLo/2)**2;return R*2*Math.atan2(Math.sqrt(s),Math.sqrt(1-s));}
const pick=(a,keys)=>{for(const k of keys) if(a[k]!=null) return a[k]; return null;};
export function parseStocking(json, loc, nowYear=new Date().getFullYear()){
  const feats=(json&&json.features)||[];
  const events=feats.map(f=>{
    const a=f.attributes||{}, g=f.geometry||{};
    const lon=g.x, lat=g.y; if(lat==null) return null;
    let yr=pick(a,["STOCK_YEAR","YEAR","SPAWN_YEAR","STOCKING_YEAR"]);
    if(yr&&yr>1e9) yr=new Date(yr).getFullYear(); // epoch ms date
    return { species:pick(a,["SPECIES","COMMON_NAME","FISH_SPECIES"])||"Unknown",
      stage:pick(a,["DEVELOPMENT_STAGE","STAGE","LIFE_STAGE"])||"",
      year:yr?+yr:null, yearsAgo:yr?nowYear-+yr:null,
      distanceKm:+km(loc.lat,loc.lon,lat,lon).toFixed(1) };
  }).filter(Boolean).sort((a,b)=>a.distanceKm-b.distanceKm);
  if(!events.length) return null;
  return { events: events.slice(0,10), nearestKm: events[0].distanceKm };
}
```

- [ ] **Step 4:** Run → PASS (2 tests).
- [ ] **Step 5: `⚙️ PIN THE ENDPOINT`** Find the live Fish-Stocking REST layer URL and confirm its fields:
```bash
# Try the LIO_Open services and the GeoHub hosted service; confirm species + year fields exist.
for n in 01 02 03 05 06 08 09; do curl -s -m 20 "https://ws.lioservices.lrc.gov.on.ca/arcgis2/rest/services/LIO_OPEN_DATA/LIO_Open${n}/MapServer?f=json" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const d=JSON.parse(s);const h=(d.layers||[]).filter(l=>/stock/i.test(l.name));if(h.length)console.log('Open${n}',h.map(l=>l.id+':'+l.name));}catch(e){}})"; done
```
Record the confirmed URL as `STOCKING_URL` in Task 5. If none is confirmable, the stocking endpoint returns `{ stocking: null }` and the model falls back to inference — the phase still ships.
- [ ] **Step 6: Commit** `git add lib/stocking.js lib/stocking.test.js && git commit -m "feat: stocking parser"`

---

### Task 5: Backend endpoints — `/api/bathymetry` + `/api/stocking`

**Files:** Modify `backend/src/routes/proxy.js`; extend `backend/test/proxy.test.js`

**Interfaces:** `GET /api/bathymetry?lat&lon` → `{ bathy: parseBathy(...) }` cached 30 days; `GET /api/stocking?lat&lon` → `{ stocking: parseStocking(...) }` cached 7 days. Both 400 on bad coords, 502 on upstream failure. Use the injected `proxyFetch`.

- [ ] **Step 1: Failing tests** append to `backend/test/proxy.test.js`:
```js
describe("bathymetry route", () => {
  it("400 on bad coords", async () => {
    const app = buildApp({ proxyFetch: stub({ features: [] }) });
    expect((await app.inject({ method:"GET", url:"/api/bathymetry?lat=x&lon=-80" })).statusCode).toBe(400);
  });
  it("returns max depth + caches", async () => {
    const f = stub({ features:[{attributes:{DEPTH:-12}},{attributes:{DEPTH:-3}}] });
    const app = buildApp({ proxyFetch: f });
    const url = "/api/bathymetry?lat=44.4&lon=-79.5";
    const a = await app.inject({ method:"GET", url });
    expect(a.json().bathy.maxDepthM).toBe(12);
    await app.inject({ method:"GET", url });
    expect(f).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2:** Run `cd backend && npx vitest run test/proxy.test.js` → FAIL (needs `TEST_DATABASE_URL`? No — proxy tests don't touch the DB, but the shared setup sets a dummy `DATABASE_URL`; proxy tests use `buildApp({proxyFetch})` and never hit prisma, so they pass regardless). Expect FAIL: route not found.

- [ ] **Step 3: Implement** in `backend/src/routes/proxy.js`:
- Imports: `import { buildBathyUrl, parseBathy } from "../../../lib/bathymetry.js";` and `import { parseStocking } from "../../../lib/stocking.js";` (the `lib/` folder is at repo root; from `backend/src/routes/` that is `../../../lib/`).
- Add routes inside the returned function:
```js
    app.get("/api/bathymetry", async (req, reply) => {
      const lat = num(req.query.lat), lon = num(req.query.lon);
      if (lat === null || lon === null) return reply.code(400).send({ error: "lat and lon required" });
      const key = `bathy:${r3(lat)},${r3(lon)}`; const hit = cache.get(key); if (hit) return hit;
      let json; try { const res = await proxyFetch([buildBathyUrl(lat, lon)], {}, { retries: 1 }); json = await res.json(); }
      catch { return reply.code(502).send({ error: "bathymetry unavailable" }); }
      const payload = { bathy: parseBathy(json) }; cache.set(key, payload, 30 * 24 * 3600 * 1000); return payload;
    });
    const STOCKING_URL = ""; // ⚙️ set from Task 4 Step 5 (empty => stocking disabled, returns null)
    app.get("/api/stocking", async (req, reply) => {
      const lat = num(req.query.lat), lon = num(req.query.lon);
      if (lat === null || lon === null) return reply.code(400).send({ error: "lat and lon required" });
      if (!STOCKING_URL) return { stocking: null };
      const key = `stock:${r3(lat)},${r3(lon)}`; const hit = cache.get(key); if (hit) return hit;
      const half = 0.25;
      const url = `${STOCKING_URL}/query?geometry=${(lon-half).toFixed(3)},${(lat-half).toFixed(3)},${(lon+half).toFixed(3)},${(lat+half).toFixed(3)}` +
        `&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=true&f=json&resultRecordCount=200`;
      let json; try { const res = await proxyFetch([url], {}, { retries: 1 }); json = await res.json(); }
      catch { return reply.code(502).send({ error: "stocking unavailable" }); }
      const payload = { stocking: parseStocking(json, { lat, lon }) }; cache.set(key, payload, 7 * 24 * 3600 * 1000); return payload;
    });
```

- [ ] **Step 4:** Run proxy tests → PASS. Then live-verify:
```bash
cd backend && npm run dev &
curl -s "http://localhost:3000/api/bathymetry?lat=44.42&lon=-79.5" | head -c 200
```
Expected: a real `bathy.maxDepthM` near a lake. Stop the server.

- [ ] **Step 5: Commit** `git add backend/src/routes/proxy.js backend/test/proxy.test.js && git commit -m "feat(backend): bathymetry + stocking endpoints"`

---

### Task 6: Frontend — "Depth & likely fish" panel

**Files:** Modify `source-app.jsx`

**Interfaces:** Consumes `holdingWater`, `estimateFish` (lib), and `proxyJSON("/api/bathymetry"|"/api/stocking")`. A `<DepthFish sec={ev.sec}/>` component renders on spot open (in the map sheet and the RecCard advisor area).

- [ ] **Step 1:** Import at top of `source-app.jsx`:
```js
import { holdingWater } from "./lib/holding-water.js";
import { estimateFish } from "./lib/fish-estimate.js";
```
- [ ] **Step 2:** Add a `DepthFish` component near `MeasuredGauge`:
```js
function DepthFish({sec}){
  const [d,setD]=useState(undefined);
  useEffect(()=>{ let live=true; setD(undefined);
    const jobs=[ API_BASE?proxyJSON(`/api/bathymetry?lat=${sec.lat}&lon=${sec.lon}`).catch(()=>({bathy:null})):Promise.resolve({bathy:null}),
      API_BASE?proxyJSON(`/api/stocking?lat=${sec.lat}&lon=${sec.lon}`).catch(()=>({stocking:null})):Promise.resolve({stocking:null}) ];
    Promise.all(jobs).then(([b,s])=>{ if(!live) return;
      const sounded=b.bathy?b.bathy.maxDepthM:null;
      const hw=holdingWater({ isTailwater:/tailwater|below the dam|below a dam/i.test(sec.section||""), waterType:(sec.water||"").toLowerCase().includes("lake")?"lake":(sec.water||"").toLowerCase().includes("stream")?"stream":"river", gradientPct:1, sinuosity:1.15, nearConfluence:false, belowLake:false, soundedMaxDepthM:sounded });
      const stock=s.stocking&&s.stocking.events&&s.stocking.events[0];
      const fish=estimateFish({ species:sec.species||[], holding:hw, stocking:stock?{species:stock.species,yearsAgo:stock.yearsAgo}:null, coldRetention:sec.h?sec.h.cold:60, month:new Date().getMonth() });
      setD({hw,bathy:b.bathy,fish,stock}); });
    return ()=>{live=false;};
  },[sec.lat,sec.lon]);
  if(d===undefined) return null;
  const {hw,bathy,fish,stock}=d;
  return (<div style={{marginTop:10,padding:"10px 12px",background:`${C.cyanDeep}12`,border:`1px solid ${C.cyanDeep}33`,borderRadius:10}}>
    <div style={{fontFamily:sans,fontSize:9.5,letterSpacing:1,textTransform:"uppercase",fontWeight:700,color:C.pine,marginBottom:5}}>Depth &amp; likely fish · estimate</div>
    <div style={{fontSize:13.5,color:C.text,lineHeight:1.5}}>
      {bathy&&bathy.maxDepthM!=null ? <><b>{bathy.maxDepthM} m</b> deepest (sounded)</> : <>Holding water: <b>{hw.class.replace("-"," ")}</b> ({hw.poolScore}/100)</>}
      {hw.drivers.length>0 && <> — {hw.drivers.slice(0,2).join(", ")}</>}.
    </div>
    <div style={{fontSize:13.5,color:C.text,lineHeight:1.5,marginTop:4}}>
      Likely: <b>{fish.species.map(s=>s.key).slice(0,3).join(", ")}</b>. Size: <b>{fish.sizeClass}</b> · {fish.ageEstimate}.
      {stock && <span style={{color:C.textDim}}> Stocked {stock.species} ~{stock.yearsAgo} yr ago, {stock.distanceKm} km.</span>}
    </div>
    <div style={{fontSize:9.5,color:C.textFaint,marginTop:5,lineHeight:1.4}}>Depth from Ontario LIO where surveyed, else modelled from river shape. Species/size are estimates that sharpen as anglers log catches.</div>
  </div>);
}
```
- [ ] **Step 3:** Render it: in `MapView`'s selected-spot card after `<MeasuredGauge .../>`, add `<DepthFish sec={ev.sec}/>`; and in `RecCard` after `<ConditionsStrip cond={cd}/>`, add `<DepthFish sec={sec}/>`.
- [ ] **Step 4:** Build + test: `npm run build && npm test` (frontend green). Serve, open a spot, confirm the Depth & likely fish panel shows (real depth where available, holding-water class otherwise).
- [ ] **Step 5: Commit** `git add source-app.jsx app.js && git commit -m "feat(frontend): depth & likely fish panel"`

---

### Task 7: A few more curated river reaches + wrap

**Files:** Modify `source-app.jsx` (`RIVERS`)

- [ ] **Step 1:** Add 4–6 well-known Southern-Ontario fly reaches to `RIVERS` following the exact existing object shape (id, river, section, region, zone, water, species, lat, lon, h{}, history, report, reportAge, conf, note). Suggested: Saugeen River (Denny's Dam), Maitland River, Beaver River upper, Grand River (Belwood tailwater alt), Sydenham River, Boyne River. Use conservative habitat numbers and honest notes.
- [ ] **Step 2:** Build + full suites: `npm run build && npm test` (frontend), `cd backend && npm test` (pure/proxy green; DB tests skip without `TEST_DATABASE_URL`).
- [ ] **Step 3:** Browser check: new reaches appear; Depth & likely fish renders for a river (holding-water class + drivers) and a lake-adjacent spot (sounded depth).
- [ ] **Step 4: Commit + tag**
```bash
git add source-app.jsx app.js && git commit -m "feat: additional curated river reaches"
git commit --allow-empty -m "chore: Phase E depth + fish intelligence complete"
```

---

## Self-Review

**Spec coverage:** bathymetry parse+service (T1,T5), river holding-water model (T2), fish size/age model (T3), stocking parse+service (T4,T5), frontend panel (T6), more rivers (T7). River-first: holding-water is the river mechanism; sounded bathymetry overrides where present (T2 precedence, T6 display). Estimate-labelling and graceful degradation in T6.

**Placeholder scan:** none — pure modules have complete code + tests; the one `⚙️ PIN` is the stocking URL, with a defined fallback (`STOCKING_URL=""` → `{stocking:null}` → model falls back), so the phase ships regardless. Verified bathymetry endpoint is concrete.

**Type/name consistency:** `holdingWater(reach)` output `{poolScore,class,deepHole,drivers}` consumed by `estimateFish({holding})` and `DepthFish`. `parseBathy` → `{maxDepthM,contourCount,deepHole}` used by the route and `DepthFish` (`soundedMaxDepthM`). `parseStocking` → `{events:[{species,yearsAgo,distanceKm}],nearestKm}` used by the route and `DepthFish` (`stock.species/yearsAgo`). Reuses `proxyFetch`, `makeCache`, `num`, `r3`, `proxyJSON`, `API_BASE`, `C`, `sec.h.cold`, `sec.species`.
