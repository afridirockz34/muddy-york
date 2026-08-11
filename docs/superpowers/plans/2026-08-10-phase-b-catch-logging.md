# Phase B — Free Catch Logging → Opportunity Nudge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Signed-in anglers (any tier, free) log catches tied to a reach (never GPS); anonymized activity nudges a reach's opportunity/confidence.

**Architecture:** New `Catch` Prisma model + auth-guarded routes + a public anonymized `/api/catch-activity` aggregate. Pure `lib/catch-nudge.js` (bounded, decayed). Frontend adds a catch form on the spot card/map sheet and blends the nudge into `ranked`.

**Tech Stack:** Fastify, Prisma/Postgres, Vitest, esbuild frontend.

## Global Constraints

- Catches store **reach-level only** — NO latitude/longitude columns.
- Logging is **auth-required but free** (all tiers); `/api/catch-activity` is public and **counts-only** (no user ids, no coordinates).
- Nudge is **bounded 0..6 opportunity points**, decays over ~30 days, applied as a thin post-step — base engine unchanged.
- Tests use `TEST_DATABASE_URL` (never prod); pure logic unit-tested.
- Reuse Phase-3 `cache`/`num`/`r3` in `proxy.js`; auth via `getCurrentUser`.

---

### Task 1: `Catch` schema

**Files:** Modify `backend/prisma/schema.prisma`

- [ ] **Step 1:** Add to `User`: `catches Catch[]`. Add model:
```prisma
model Catch {
  id           String   @id @default(cuid())
  userId       String
  ref          String
  river        String
  section      String
  species      String
  sizeInches   Float?
  technique    String?
  flies        String?
  caughtAt     DateTime @default(now())
  createdAt    DateTime @default(now())
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([ref])
  @@index([userId])
}
```
- [ ] **Step 2:** Sync: `cd backend && npx prisma db push --accept-data-loss` → `Catch` table created.
- [ ] **Step 3:** Commit `git add backend/prisma && git commit -m "feat(backend): Catch model (reach-level, no GPS)"`

---

### Task 2: Catch nudge + momentum (pure, TDD)

**Files:** Create `lib/catch-nudge.js`, `lib/catch-nudge.test.js`

**Interfaces:** `catchNudge(momentum) => number` (0..6, `momentum` in 0..1); `momentumFrom(catchDates, now) => number` (0..1 from an array of ISO date strings — recent+frequent → higher, all-old → ~0; ~30-day half-life).

- [ ] **Step 1: Failing test** `lib/catch-nudge.test.js`:
```js
import { describe, it, expect } from "vitest";
import { catchNudge, momentumFrom } from "./catch-nudge.js";
const now = new Date("2026-08-10T12:00:00Z");
describe("catch nudge", () => {
  it("bounds the nudge to 0..6", () => {
    expect(catchNudge(0)).toBe(0);
    expect(catchNudge(1)).toBe(6);
    expect(catchNudge(0.5)).toBeGreaterThan(0);
    expect(catchNudge(5)).toBe(6);
  });
  it("momentum: recent+frequent high, old ~0", () => {
    const recent = [ "2026-08-09","2026-08-07","2026-08-05" ].map(d=>d+"T12:00:00Z");
    const old = [ "2026-01-01","2025-11-01" ].map(d=>d+"T12:00:00Z");
    expect(momentumFrom(recent, now)).toBeGreaterThan(momentumFrom(old, now));
    expect(momentumFrom(old, now)).toBeLessThan(0.2);
    expect(momentumFrom([], now)).toBe(0);
  });
});
```
- [ ] **Step 2:** Run `npx vitest run lib/catch-nudge.test.js` → FAIL.
- [ ] **Step 3: Implement** `lib/catch-nudge.js`:
```js
export function catchNudge(momentum) {
  const m = Math.max(0, Math.min(1, momentum || 0));
  return Math.round(m * 6);
}
const HALF_LIFE_DAYS = 30;
export function momentumFrom(dates, now = new Date()) {
  if (!Array.isArray(dates) || !dates.length) return 0;
  const t = now.getTime();
  let sum = 0;
  for (const d of dates) {
    const days = (t - new Date(d).getTime()) / 86400000;
    if (days < 0) continue;
    sum += Math.pow(0.5, days / HALF_LIFE_DAYS); // decayed weight per catch
  }
  // saturate: ~4 recent catches ≈ full momentum
  return Math.max(0, Math.min(1, sum / 4));
}
```
- [ ] **Step 4:** Run → PASS (2 tests).
- [ ] **Step 5:** Commit `git add lib/catch-nudge.js lib/catch-nudge.test.js && git commit -m "feat: bounded catch nudge + momentum"`

---

### Task 3: Catch routes + activity aggregate

**Files:** Create `backend/src/routes/catches.js`; Modify `backend/src/app.js`; Create `backend/test/catches.test.js`

**Interfaces:** `POST /catches` (auth), `GET /catches` (auth), `DELETE /catches/:id` (auth), `GET /api/catch-activity` (public, anonymized). Uses `momentumFrom` from `../../../lib/catch-nudge.js`.

- [ ] **Step 1: Failing test** `backend/test/catches.test.js`:
```js
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { resetDb } from "./helpers/db.js";
const app = buildApp();
const cookieName = process.env.SESSION_COOKIE_NAME || "my_session";
async function signup(email){ const s=await app.inject({method:"POST",url:"/auth/signup",payload:{email,password:"supersecret1"}}); return s.cookies.find(c=>c.name===cookieName).value; }
const body = { ref:"grand-tw", river:"Grand River", section:"Tailwater", species:"Brown trout", sizeInches:14 };

describe("catches", () => {
  beforeEach(resetDb);
  afterAll(()=>prisma.$disconnect());
  it("401 unauthenticated", async () => {
    expect((await app.inject({method:"POST",url:"/catches",payload:body})).statusCode).toBe(401);
  });
  it("logs, lists own, and never stores coordinates", async () => {
    const c = { [cookieName]: await signup("c@b.com") };
    const r = await app.inject({ method:"POST", url:"/catches", cookies:c, payload:body });
    expect(r.statusCode).toBe(200);
    const row = await prisma.catch.findFirst();
    expect(row.ref).toBe("grand-tw");
    expect(Object.keys(row)).not.toContain("lat");
    expect(Object.keys(row)).not.toContain("lon");
    const list = await app.inject({ method:"GET", url:"/catches", cookies:c });
    expect(list.json().catches).toHaveLength(1);
  });
  it("activity is anonymized counts only (no userId/coords)", async () => {
    const c = { [cookieName]: await signup("a@b.com") };
    await app.inject({ method:"POST", url:"/catches", cookies:c, payload:body });
    const act = await app.inject({ method:"GET", url:"/api/catch-activity" });
    const a = act.json().activity["grand-tw"];
    expect(a.count30d).toBe(1);
    expect(a.momentum).toBeGreaterThan(0);
    expect(JSON.stringify(act.json())).not.toMatch(/userId|@b\.com|lat|lon/);
  });
});
```
- [ ] **Step 2:** Run `cd backend && TEST_DATABASE_URL=$DATABASE_URL npx vitest run test/catches.test.js` → FAIL (routes missing). *(Set `TEST_DATABASE_URL` to a throwaway DB, e.g. a Neon branch; see `.env.example`.)*
- [ ] **Step 3: Implement** `backend/src/routes/catches.js`:
```js
import { prisma } from "../db.js";
import { getCurrentUser } from "../auth/current-user.js";
import { momentumFrom } from "../../../lib/catch-nudge.js";

export default async function catchRoutes(app) {
  const auth = async (req, reply) => { const u = await getCurrentUser(req); if (!u) { reply.code(401).send({ error: "sign in to log a catch" }); return; } req.user = u; };

  app.post("/catches", { preHandler: auth }, async (req, reply) => {
    const b = req.body || {};
    if (!b.ref || !b.species) return reply.code(400).send({ error: "ref and species required" });
    const size = b.sizeInches != null ? Math.max(0, Math.min(80, +b.sizeInches)) : null;
    const c = await prisma.catch.create({ data: {
      userId: req.user.id, ref: String(b.ref), river: b.river || "", section: b.section || "",
      species: String(b.species), sizeInches: Number.isFinite(size) ? size : null,
      technique: b.technique || null, flies: b.flies || null,
    }});
    return { catch: { id: c.id, ref: c.ref, species: c.species, sizeInches: c.sizeInches, caughtAt: c.caughtAt } };
  });

  app.get("/catches", { preHandler: auth }, async (req) => {
    const catches = await prisma.catch.findMany({ where: { userId: req.user.id }, orderBy: { caughtAt: "desc" }, take: 200 });
    return { catches };
  });

  app.delete("/catches/:id", { preHandler: auth }, async (req) => {
    await prisma.catch.deleteMany({ where: { id: req.params.id, userId: req.user.id } });
    return { ok: true };
  });

  app.get("/api/catch-activity", async () => {
    const since = new Date(Date.now() - 90 * 86400000);
    const rows = await prisma.catch.findMany({ where: { caughtAt: { gte: since } }, select: { ref: true, caughtAt: true } });
    const byRef = {};
    for (const r of rows) (byRef[r.ref] ||= []).push(r.caughtAt.toISOString());
    const now = new Date(), cutoff30 = Date.now() - 30 * 86400000;
    const activity = {};
    for (const ref of Object.keys(byRef)) {
      const dates = byRef[ref];
      activity[ref] = {
        count30d: dates.filter((d) => new Date(d).getTime() >= cutoff30).length,
        lastDays: Math.round((now.getTime() - Math.max(...dates.map((d) => new Date(d).getTime()))) / 86400000),
        momentum: +momentumFrom(dates, now).toFixed(3),
      };
    }
    return { activity };
  });
}
```
- [ ] **Step 4:** Add to `backend/src/app.js`: `import catchRoutes from "./routes/catches.js";` and `app.register(catchRoutes);`.
- [ ] **Step 5:** Run the test (with `TEST_DATABASE_URL`) → PASS (3 tests).
- [ ] **Step 6:** Commit `git add backend/src/routes/catches.js backend/src/app.js backend/test/catches.test.js && git commit -m "feat(backend): catch logging + anonymized activity"`

---

### Task 4: Frontend — log a catch + opportunity nudge

**Files:** Modify `source-app.jsx`

**Interfaces:** Consumes `catchNudge` (lib), `proxyJSON`, `API_BASE`, `me`/`isPremiumMe` (signed-in check), `SPECIES`.

- [ ] **Step 1:** Import: `import { catchNudge } from "./lib/catch-nudge.js";`
- [ ] **Step 2:** In `App`, add `const [catchActivity,setCatchActivity]=useState({});` and in the startup effect (when `API_BASE`): `proxyJSON("/api/catch-activity").then(d=>setCatchActivity(d.activity||{})).catch(()=>{});`
- [ ] **Step 3:** In the `ranked` memo, after computing each `ev`, add the nudge:
```js
    const nudge = (ref)=>catchNudge((catchActivity[ref]||{}).momentum);
    const curated=RIVERS.map(s=>{ const ev={...evaluate(s,month,condFor(s),now),source:"verified"}; const n=nudge(s.id); return {...ev, opportunity:Math.min(100,ev.opportunity+n), confidence:Math.min(98,ev.confidence+Math.round(n/2))}; });
    const auto=discovered.map(s=>{ const ev=evaluate(s,month,condFor(s),now); const n=nudge(s.id); return {...ev,source:"auto",confidence:Math.min(70,applySourcePenalty(ev.confidence,"auto")+Math.round(n/2)),opportunity:Math.min(100,ev.opportunity+n)}; });
```
Add `catchActivity` to the memo's dependency array.
- [ ] **Step 4:** Add a `CatchForm` component (signed-in gate) near `DepthFish`:
```js
function CatchForm({sec, signedIn}){
  const [open,setOpen]=useState(false); const [sp,setSp]=useState(sec.species&&sec.species[0]||"BNT");
  const [size,setSize]=useState(""); const [done,setDone]=useState(false); const [busy,setBusy]=useState(false);
  if(!API_BASE) return null;
  if(!signedIn) return (<div style={{marginTop:10,fontSize:12.5,color:C.textDim}}>Sign in to log a catch — it's free and helps everyone.</div>);
  if(done) return (<div style={{marginTop:10,fontSize:13,color:C.pine,fontWeight:600}}>Logged — thanks, it helps everyone.</div>);
  const submit=async()=>{ setBusy(true);
    try{ await proxyJSON("/catches",{method:"POST",body:{ref:sec.id,river:sec.river,section:sec.section,species:SPECIES[sp]?SPECIES[sp].name:sp,sizeInches:size?+size:null}}); setDone(true); }
    catch{ setBusy(false); } };
  const inp={padding:"9px 11px",borderRadius:8,border:`1px solid ${C.line}`,background:C.bone,color:C.text,fontFamily:sans,fontSize:14};
  if(!open) return (<button onClick={()=>setOpen(true)} style={{...btnBig,marginTop:10,borderColor:C.brass,color:C.pine}}><Icon name="plus" size={15}/>Log a catch</button>);
  return (<div style={{marginTop:10,padding:12,background:C.panel,border:`1px solid ${C.line}`,borderRadius:10}}>
    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
      <select value={sp} onChange={e=>setSp(e.target.value)} style={inp}>{(sec.species&&sec.species.length?sec.species:Object.keys(SPECIES)).map(k=><option key={k} value={k}>{SPECIES[k]?SPECIES[k].name:k}</option>)}</select>
      <input style={{...inp,width:110}} type="number" placeholder="size (in)" value={size} onChange={e=>setSize(e.target.value)}/>
      <button disabled={busy} onClick={submit} style={{...btnBig,background:C.pine,color:C.headText,borderColor:C.pine}}>{busy?"…":"Submit"}</button>
    </div>
    <div style={{fontSize:11,color:C.textFaint,marginTop:8}}>Attached to this reach only — never your exact location.</div>
  </div>);
}
```
- [ ] **Step 5:** Render `<CatchForm sec={sec} signedIn={!!(me&&me.user)}/>` in `RecCard` (after `<DepthFish sec={sec}/>`) and `<CatchForm sec={ev.sec} signedIn={!!(me&&me.user)}/>` in the map sheet (after `<DepthFish sec={ev.sec}/>`). `RecCard`/`MapView` receive `me` — thread `me` (or a `signedIn` bool) through: add `signedIn` to `RecCard` props and pass `signedIn={!!(me&&me.user)}` at the call sites; `MapView` already can take a new `signedIn` prop.
- [ ] **Step 6:** Build + test: `npm run build && npm test` (frontend green; new `catch-nudge` test passes).
- [ ] **Step 7:** Commit `git add source-app.jsx app.js && git commit -m "feat(frontend): log a catch + opportunity nudge"`

---

### Task 5: Live verify + wrap

- [ ] **Step 1:** Start backend + frontend pointed at `localhost:3000` (temp `MUDDY_API_BASE`), sign up, open a spot, **Log a catch** (species + size) → "Logged" confirmation. Confirm `POST /catches` 200 and `GET /api/catch-activity` shows the ref with `momentum>0` and **no userId/coords** in the JSON.
- [ ] **Step 2:** Confirm the reach's opportunity rises by a few points after logging (refresh). Restore `index.html` to `/bk`; stop servers.
- [ ] **Step 3:** Full suites: `npm test` (frontend), and backend `TEST_DATABASE_URL=… npm test`.
- [ ] **Step 4:** Commit + tag `git commit --allow-empty -m "chore: Phase B catch logging complete"`

---

## Self-Review

**Spec coverage:** Catch model reach-level/no-GPS (T1), bounded decayed nudge (T2), auth-free-logging + anonymized activity (T3), frontend form + nudge blend + signed-in gate (T4), verification (T5). Privacy guarantee tested (T3 asserts no userId/coords in activity JSON and no lat/lon columns).

**Placeholder scan:** none — pure module has full code+tests; routes/UI have complete code. `TEST_DATABASE_URL` requirement is the existing test-safety guard, not a placeholder.

**Type/name consistency:** `momentumFrom(dates,now)`→0..1 used by `/api/catch-activity`; `catchNudge(momentum)`→0..6 used in `ranked`. `Catch` fields (`ref,river,section,species,sizeInches,technique,flies,caughtAt`) match `POST /catches` body and the form payload. `activity[ref].momentum` shape consumed by `catchNudge`. Reuses `getCurrentUser`, `proxyJSON`, `API_BASE`, `SPECIES`, `applySourcePenalty`, `evaluate`, `btnBig`, `Icon`, `me`.
