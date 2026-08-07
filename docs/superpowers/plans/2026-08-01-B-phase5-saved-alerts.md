# Production Foundation — Phase 5: Saved Spots (server-side) + Email Alerts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store each user's saved waters + alert preferences on the backend, and email them when a saved water hits "prime" conditions — without duplicate spam — via a scheduled job.

**Architecture:** New `SavedSpot` + alert-pref fields, auth-guarded CRUD, a bounded backend prime-conditions evaluator (mirrors the frontend formula from stored habitat/species inputs + live Open-Meteo), a de-dup alert decision, an injected Resend mailer, and a runnable scheduler script. Frontend stores scoring inputs on save and syncs local spots up on login.

**Tech Stack:** Fastify, Prisma, Postgres, Open-Meteo (keyless), Resend (email), Vitest.

## Global Constraints

- Saved-spots + prefs routes are **auth-required** (401 when logged out).
- The backend evaluator is a **documented, bounded port** of the app's scoring — it consumes habitat facets `h{}`, `species[]`, `history` stored on the `SavedSpot` (sent by the frontend), plus live weather. It may differ slightly from the app's exact number; a future refactor can unify them behind one shared engine.
- Alerts **de-dup**: only email when a spot crosses into prime and not again within a cooldown (default 20 h), tracked by `lastAlertAt`.
- Email is sent through an **injected mailer** so tests never hit Resend; live send needs `⚙️ YOU PROVIDE RESEND_API_KEY`.
- Scheduler is a standalone script (`npm run alerts:run`) so it works as a Render Cron Job.

---

### Task 1: Schema — SavedSpot + alert prefs

**Files:** Modify `backend/prisma/schema.prisma`

- [ ] **Step 1: Add models/fields**

Add to `User`:
```prisma
  alertEmail     Boolean     @default(true)
  alertThreshold Int         @default(75)
  savedSpots     SavedSpot[]
```
Add a model:
```prisma
model SavedSpot {
  id          String   @id @default(cuid())
  userId      String
  ref         String
  river       String
  section     String
  lat         Float
  lon         Float
  source      String   @default("verified")
  habitat     Json
  species     Json
  history     Int      @default(60)
  lastAlertAt DateTime?
  createdAt   DateTime @default(now())
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([userId, ref])
}
```

- [ ] **Step 2: Sync to Neon**

```bash
cd backend && npx prisma db push --accept-data-loss
```
Expected: `SavedSpot` table + `User.alertEmail/alertThreshold` created.

- [ ] **Step 3: Commit**

```bash
cd /Users/faheemafridi/river-intel-pwa
git add backend/prisma && git commit -m "feat(backend): saved-spot + alert-pref schema"
```

---

### Task 2: Prime-conditions evaluator (pure, TDD)

**Files:** Create `backend/src/alerts/score.js`, `backend/src/alerts/score.test.js`

**Interfaces:** `scoreSpot({ habitat, species, history }, weather, now) => number` (0–100 opportunity), where `weather = { airMean, days, flow?, wind?, pressureTrend?, cloud?, sunrise?, sunset? }`. Plus `SPECIES_ACT` (color-free monthly activity + mode per key) and `modelStreamTemp(cold, airMean)`.

- [ ] **Step 1: Write the failing test**

`backend/src/alerts/score.test.js`:
```js
import { describe, it, expect } from "vitest";
import { scoreSpot, modelStreamTemp } from "./score.js";

const habitat = { hold: 88, struct: 80, spawn: 70, cold: 95, ox: 86, gw: 60 };

describe("modelStreamTemp", () => {
  it("cold reaches stay colder than warm ones for the same air temp", () => {
    expect(modelStreamTemp(95, 22)).toBeLessThan(modelStreamTemp(40, 22));
  });
});

describe("scoreSpot", () => {
  it("scores higher in cool water than warm water", () => {
    const cool = scoreSpot({ habitat, species: ["BNT"], history: 90 },
      { airMean: 12, days: 4, flow: "Normal" }, new Date("2026-05-15T08:00:00Z"));
    const warm = scoreSpot({ habitat, species: ["BNT"], history: 90 },
      { airMean: 28, days: 4, flow: "Normal" }, new Date("2026-05-15T08:00:00Z"));
    expect(cool).toBeGreaterThan(warm);
    expect(cool).toBeGreaterThanOrEqual(0);
    expect(cool).toBeLessThanOrEqual(100);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npx vitest run src/alerts/score.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement (bounded port of the app engine)**

`backend/src/alerts/score.js`:
```js
// Bounded port of the frontend scoring (source-app.jsx) — enough to judge a
// prime-conditions alert. Color/UI-free. Keep the numbers in sync with the app.
export const SPECIES_ACT = {
  STL: { mode: "run", a: [0.50,0.55,0.85,1.00,0.55,0.10,0.05,0.05,0.35,0.70,0.85,0.60] },
  CHN: { mode: "run", a: [0,0,0,0,0,0,0.05,0.55,1.00,0.70,0.15,0] },
  COH: { mode: "run", a: [0,0,0,0,0,0,0,0.10,0.30,0.90,0.70,0.10] },
  BNTr:{ mode: "run", a: [0.15,0.15,0.20,0.25,0.15,0.05,0.05,0.10,0.40,0.90,0.80,0.30] },
  BNT: { mode: "resident", a: [0.40,0.40,0.60,0.80,0.90,0.85,0.70,0.65,0.85,0.90,0.60,0.45] },
  RBT: { mode: "resident", a: [0.30,0.30,0.55,0.80,0.85,0.75,0.60,0.55,0.80,0.85,0.55,0.35] },
  BKT: { mode: "resident", a: [0.10,0.10,0.10,0.70,0.95,0.90,0.75,0.70,0.85,0.15,0.10,0.10] },
  ATS: { mode: "run", a: [0.05,0.05,0.05,0.05,0.20,0.40,0.50,0.55,0.60,0.40,0.10,0.05] },
  LAT: { mode: "resident", a: [0.70,0.65,0.70,0.60,0.30,0.15,0.10,0.10,0.25,0.55,0.75,0.75] },
  SMB: { mode: "resident", a: [0.05,0.05,0.10,0.35,0.75,0.95,0.90,0.85,0.75,0.55,0.20,0.08] },
  NP:  { mode: "resident", a: [0.35,0.35,0.55,0.85,0.80,0.60,0.50,0.50,0.65,0.80,0.70,0.45] },
  WAL: { mode: "resident", a: [0.30,0.30,0.55,0.80,0.70,0.60,0.55,0.55,0.70,0.80,0.60,0.40] },
  PAN: { mode: "resident", a: [0.15,0.15,0.30,0.60,0.85,0.95,0.90,0.85,0.75,0.55,0.30,0.18] },
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const clamp100 = (v) => clamp(v, 0, 100);

export function modelStreamTemp(cold, airMean) {
  const gwBase = 8 + (1 - cold / 100) * 4.5;
  const track = 0.34 + 0.56 * (1 - cold / 100);
  return Math.max(2, Math.min(27, gwBase + track * (airMean - gwBase)));
}
function habitatComposite(h) {
  return Math.round(0.26*h.cold + 0.22*h.hold + 0.16*h.struct + 0.14*h.ox + 0.12*h.spawn + 0.10*h.gw);
}
function bestSpecies(species, m) {
  let best = null, val = -1;
  for (const k of species) { const sp = SPECIES_ACT[k]; if (sp && sp.a[m] > val) { val = sp.a[m]; best = k; } }
  return { key: best, activity: val < 0 ? 0 : val };
}
function thermalFactor(t) {
  if (t <= 15) return 1.0;
  if (t <= 18) return 1 - (t - 15) * 0.10;
  if (t <= 21) return 0.70 - (t - 18) * 0.16;
  return Math.max(0.08, 0.22 - (t - 21) * 0.05);
}
function flowFit(flow, mode) {
  const tb = { "Low / clear": {resident:0.85,run:0.55}, "Normal": {resident:1.0,run:0.85},
    "High / stained": {resident:0.70,run:1.0}, "Blown out": {resident:0.25,run:0.30} };
  return (tb[flow] || tb["Normal"])[mode];
}
function freshnessFactor(days, mode) { if (mode !== "run") return 1; if (days <= 1) return 0.7; if (days <= 4) return 1.0; if (days <= 8) return 0.8; return 0.55; }
function windFactor(w) { if (w == null) return 1; return w < 12 ? 1.0 : w < 25 ? 0.92 : w < 40 ? 0.70 : 0.45; }
function pressureFactor(tr) { if (tr == null) return 1; const a = Math.abs(tr); if (a < 1.5) return 1.0; if (tr < 0) return tr > -4 ? 1.08 : 0.95; return tr < 4 ? 0.90 : 0.80; }
function cloudFactor(c, flow) { if (c == null) return 1; if (c > 70) return 1.08; if (c < 30) return flow === "Low / clear" ? 0.85 : 0.95; return 1.0; }
function feedingWindow(now) { const h = now.getHours(); if ((h>=5&&h<8)||(h>=19&&h<22)) return 1.10; if (h>=11&&h<16) return 0.85; return 0.95; }

export function scoreSpot({ habitat, species, history }, weather, now = new Date()) {
  const m = now.getMonth();
  const bs = bestSpecies(species || [], m);
  const mode = (SPECIES_ACT[bs.key] && SPECIES_ACT[bs.key].mode) || "resident";
  const temp = modelStreamTemp(habitat.cold, weather.airMean);
  const flow = weather.flow || "Normal";
  const water = clamp100(100 * thermalFactor(temp) * flowFit(flow, mode) * freshnessFactor(weather.days ?? 4, mode));
  const weatherComp = clamp100(100 * windFactor(weather.wind) * pressureFactor(weather.pressureTrend) * cloudFactor(weather.cloud, flow));
  const time = clamp100(100 * feedingWindow(now));
  const seasonal = Math.round(100 * bs.activity);
  const hab = habitatComposite(habitat);
  let opp = 0.20*hab + 0.20*seasonal + 0.22*water + 0.18*weatherComp + 0.08*time + 0.07*(history ?? 60);
  if (temp >= 20) opp *= 0.5;
  return Math.round(clamp100(opp));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && npx vitest run src/alerts/score.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/alerts && git commit -m "feat(backend): bounded prime-conditions evaluator for alerts"
```

---

### Task 3: Alert decision (de-dup, pure, TDD)

**Files:** Create `backend/src/alerts/decide.js`, `backend/src/alerts/decide.test.js`

**Interfaces:** `shouldAlert({ opportunity, threshold, lastAlertAt }, now, cooldownH = 20) => boolean` — true only when `opportunity >= threshold` AND (`lastAlertAt` null or older than the cooldown).

- [ ] **Step 1: Write the failing test**

`backend/src/alerts/decide.test.js`:
```js
import { describe, it, expect } from "vitest";
import { shouldAlert } from "./decide.js";
const now = new Date("2026-05-15T08:00:00Z");

describe("shouldAlert", () => {
  it("alerts when at/above threshold and never alerted", () => {
    expect(shouldAlert({ opportunity: 80, threshold: 75, lastAlertAt: null }, now)).toBe(true);
  });
  it("does not alert below threshold", () => {
    expect(shouldAlert({ opportunity: 60, threshold: 75, lastAlertAt: null }, now)).toBe(false);
  });
  it("respects the cooldown", () => {
    const recent = new Date(now.getTime() - 2 * 3600000);
    expect(shouldAlert({ opportunity: 90, threshold: 75, lastAlertAt: recent }, now)).toBe(false);
    const old = new Date(now.getTime() - 30 * 3600000);
    expect(shouldAlert({ opportunity: 90, threshold: 75, lastAlertAt: old }, now)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npx vitest run src/alerts/decide.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`backend/src/alerts/decide.js`:
```js
export function shouldAlert({ opportunity, threshold, lastAlertAt }, now = new Date(), cooldownH = 20) {
  if (opportunity < threshold) return false;
  if (!lastAlertAt) return true;
  return now.getTime() - new Date(lastAlertAt).getTime() >= cooldownH * 3600000;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && npx vitest run src/alerts/decide.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/alerts && git commit -m "feat(backend): alert de-dup decision"
```

---

### Task 4: Saved-spots + alert-prefs routes

**Files:** Create `backend/src/routes/saved.js`; Modify `backend/src/app.js`; Create `backend/test/saved.test.js`

**Interfaces:** auth-required routes — `GET /saved-spots`, `POST /saved-spots` (upsert by `(userId, ref)`), `DELETE /saved-spots/:ref`, `GET /alert-prefs`, `PUT /alert-prefs`.

- [ ] **Step 1: Write the failing test**

`backend/test/saved.test.js`:
```js
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { resetDb } from "./helpers/db.js";

const app = buildApp();
const cookieName = process.env.SESSION_COOKIE_NAME || "my_session";
async function signup(email) {
  const s = await app.inject({ method: "POST", url: "/auth/signup", payload: { email, password: "supersecret1" } });
  return s.cookies.find((c) => c.name === cookieName).value;
}
const spot = { ref: "grand-tw", river: "Grand River", section: "Tailwater", lat: 43.71, lon: -80.37,
  source: "verified", habitat: { hold:88,struct:80,spawn:70,cold:95,ox:86,gw:60 }, species: ["BNT","RBT"], history: 90 };

describe("saved-spots + alert-prefs", () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  it("401s unauthenticated", async () => {
    expect((await app.inject({ method: "GET", url: "/saved-spots" })).statusCode).toBe(401);
  });
  it("saves, lists, and deletes a spot", async () => {
    const token = await signup("s@b.com");
    const c = { [cookieName]: token };
    const save = await app.inject({ method: "POST", url: "/saved-spots", cookies: c, payload: spot });
    expect(save.statusCode).toBe(200);
    const list = await app.inject({ method: "GET", url: "/saved-spots", cookies: c });
    expect(list.json().spots).toHaveLength(1);
    expect(list.json().spots[0].ref).toBe("grand-tw");
    await app.inject({ method: "POST", url: "/saved-spots", cookies: c, payload: spot }); // upsert, no dup
    expect((await app.inject({ method: "GET", url: "/saved-spots", cookies: c })).json().spots).toHaveLength(1);
    const del = await app.inject({ method: "DELETE", url: "/saved-spots/grand-tw", cookies: c });
    expect(del.statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/saved-spots", cookies: c })).json().spots).toHaveLength(0);
  });
  it("reads and updates alert prefs", async () => {
    const token = await signup("p@b.com");
    const c = { [cookieName]: token };
    expect((await app.inject({ method: "GET", url: "/alert-prefs", cookies: c })).json()).toMatchObject({ alertEmail: true, alertThreshold: 75 });
    await app.inject({ method: "PUT", url: "/alert-prefs", cookies: c, payload: { alertEmail: false, alertThreshold: 85 } });
    expect((await app.inject({ method: "GET", url: "/alert-prefs", cookies: c })).json()).toMatchObject({ alertEmail: false, alertThreshold: 85 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npx vitest run test/saved.test.js`
Expected: FAIL — routes not found.

- [ ] **Step 3: Implement**

`backend/src/routes/saved.js`:
```js
import { prisma } from "../db.js";
import { getCurrentUser } from "../auth/current-user.js";

export default async function savedRoutes(app) {
  const auth = async (req, reply) => {
    const user = await getCurrentUser(req);
    if (!user) { reply.code(401).send({ error: "not authenticated" }); return; }
    req.user = user;
  };

  app.get("/saved-spots", { preHandler: auth }, async (req) => {
    const spots = await prisma.savedSpot.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: "desc" } });
    return { spots };
  });

  app.post("/saved-spots", { preHandler: auth }, async (req, reply) => {
    const b = req.body || {};
    if (!b.ref || b.lat == null || b.lon == null) return reply.code(400).send({ error: "ref, lat, lon required" });
    const data = { river: b.river || "", section: b.section || "", lat: b.lat, lon: b.lon,
      source: b.source || "verified", habitat: b.habitat || {}, species: b.species || [], history: b.history ?? 60 };
    const spot = await prisma.savedSpot.upsert({
      where: { userId_ref: { userId: req.user.id, ref: b.ref } },
      create: { userId: req.user.id, ref: b.ref, ...data },
      update: data,
    });
    return { spot };
  });

  app.delete("/saved-spots/:ref", { preHandler: auth }, async (req) => {
    await prisma.savedSpot.deleteMany({ where: { userId: req.user.id, ref: req.params.ref } });
    return { ok: true };
  });

  app.get("/alert-prefs", { preHandler: auth }, async (req) => {
    return { alertEmail: req.user.alertEmail, alertThreshold: req.user.alertThreshold };
  });

  app.put("/alert-prefs", { preHandler: auth }, async (req) => {
    const b = req.body || {};
    const user = await prisma.user.update({ where: { id: req.user.id },
      data: { alertEmail: typeof b.alertEmail === "boolean" ? b.alertEmail : req.user.alertEmail,
        alertThreshold: Number.isInteger(b.alertThreshold) ? b.alertThreshold : req.user.alertThreshold } });
    return { alertEmail: user.alertEmail, alertThreshold: user.alertThreshold };
  });
}
```

- [ ] **Step 4: Register in `app.js`**

Add `import savedRoutes from "./routes/saved.js";` and `app.register(savedRoutes);` in `buildApp`.

- [ ] **Step 5: Run to verify it passes**

Run: `cd backend && npx vitest run test/saved.test.js`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/src backend/test/saved.test.js && git commit -m "feat(backend): saved-spots + alert-prefs routes"
```

---

### Task 5: Mailer (Resend, injected)

**Files:** Create `backend/src/alerts/mailer.js`, `backend/src/alerts/mailer.test.js`; Modify `backend/src/config.js`, `backend/.env.example`

**Interfaces:** `sendAlertEmail(to, spot, opportunity, { fetchImpl }) => Promise<boolean>` — POSTs to the Resend API; returns false (never throws) when no key or on failure.

- [ ] **Step 1: Config + env**

Add to `config` in `config.js`:
```js
  resend: { apiKey: process.env.RESEND_API_KEY || "", from: process.env.EMAIL_FROM || "Muddy York <onboarding@resend.dev>" },
```
Append to `backend/.env.example`:
```
RESEND_API_KEY=re_...
EMAIL_FROM=Muddy York <onboarding@resend.dev>
```

- [ ] **Step 2: Write the failing test**

`backend/src/alerts/mailer.test.js`:
```js
import { describe, it, expect, vi } from "vitest";
import { sendAlertEmail } from "./mailer.js";

const spot = { river: "Grand River", section: "Tailwater" };

describe("sendAlertEmail", () => {
  it("posts to resend and returns true on 200", async () => {
    process.env.RESEND_API_KEY = "re_test";
    const fetchImpl = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    const ok = await sendAlertEmail("a@b.com", spot, 82, { fetchImpl });
    expect(ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith("https://api.resend.com/emails", expect.objectContaining({ method: "POST" }));
  });
  it("returns false (no throw) when no api key", async () => {
    process.env.RESEND_API_KEY = "";
    const ok = await sendAlertEmail("a@b.com", spot, 82, { fetchImpl: vi.fn() });
    expect(ok).toBe(false);
  });
});
```
> Note: `config.js` reads env at import; this test sets `RESEND_API_KEY` before importing indirectly. To keep it robust, `mailer.js` reads `process.env.RESEND_API_KEY` at call time (not import) — see implementation.

- [ ] **Step 3: Run to verify it fails**

Run: `cd backend && npx vitest run src/alerts/mailer.test.js`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement (reads key at call time for testability)**

`backend/src/alerts/mailer.js`:
```js
import { config } from "../config.js";

export async function sendAlertEmail(to, spot, opportunity, opts = {}) {
  const { fetchImpl = fetch } = opts;
  const apiKey = process.env.RESEND_API_KEY || config.resend.apiKey;
  if (!apiKey) return false;
  try {
    const res = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: config.resend.from,
        to,
        subject: `Prime conditions on the ${spot.river}`,
        text: `${spot.river} — ${spot.section} is showing prime conditions right now (opportunity ${opportunity}/100). Tight lines.\n\n— Muddy York Angling Co.`,
      }),
    });
    return !!(res && res.ok);
  } catch {
    return false;
  }
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd backend && npx vitest run src/alerts/mailer.test.js`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/src/alerts backend/src/config.js backend/.env.example && git commit -m "feat(backend): resend alert mailer"
```

---

### Task 6: Alert runner + scheduler script

**Files:** Create `backend/src/alerts/run.js`, `backend/test/alerts-run.test.js`; Modify `backend/package.json` (script)

**Interfaces:** `runAlerts({ now, fetchWeather, sendEmail }) => Promise<{ evaluated, sent }>` — iterates users with `alertEmail`, evaluates each saved spot, and emails + stamps `lastAlertAt` on prime crossings. Dependencies injected for testing. `src/alerts/cron.js` wires the real Open-Meteo fetch + mailer and is the script entry.

- [ ] **Step 1: Write the failing test**

`backend/test/alerts-run.test.js`:
```js
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "../src/db.js";
import { resetDb } from "./helpers/db.js";
import { runAlerts } from "../src/alerts/run.js";

const habitat = { hold:88,struct:80,spawn:70,cold:95,ox:86,gw:60 };

describe("runAlerts", () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  it("emails once for a prime spot and de-dups on the next run", async () => {
    const user = await prisma.user.create({ data: { email: "r@b.com", alertEmail: true, alertThreshold: 60 } });
    await prisma.savedSpot.create({ data: { userId: user.id, ref: "x", river: "R", section: "S",
      lat: 43.7, lon: -80.3, habitat, species: ["BNT"], history: 90 } });
    const fetchWeather = vi.fn().mockResolvedValue({ airMean: 10, days: 4, flow: "Normal" }); // cool => high score
    const sendEmail = vi.fn().mockResolvedValue(true);
    const now = new Date("2026-05-15T12:00:00Z");
    const r1 = await runAlerts({ now, fetchWeather, sendEmail });
    expect(r1.sent).toBe(1);
    const r2 = await runAlerts({ now, fetchWeather, sendEmail });
    expect(r2.sent).toBe(0); // cooled down
  });

  it("skips users with alertEmail off", async () => {
    const user = await prisma.user.create({ data: { email: "o@b.com", alertEmail: false, alertThreshold: 10 } });
    await prisma.savedSpot.create({ data: { userId: user.id, ref: "y", river: "R", section: "S",
      lat: 43.7, lon: -80.3, habitat, species: ["BNT"], history: 90 } });
    const r = await runAlerts({ now: new Date("2026-05-15T12:00:00Z"),
      fetchWeather: vi.fn().mockResolvedValue({ airMean: 10, days: 4, flow: "Normal" }), sendEmail: vi.fn() });
    expect(r.sent).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npx vitest run test/alerts-run.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the runner**

`backend/src/alerts/run.js`:
```js
import { prisma } from "../db.js";
import { scoreSpot } from "./score.js";
import { shouldAlert } from "./decide.js";

export async function runAlerts({ now = new Date(), fetchWeather, sendEmail } = {}) {
  const users = await prisma.user.findMany({ where: { alertEmail: true }, include: { savedSpots: true } });
  let evaluated = 0, sent = 0;
  for (const user of users) {
    for (const spot of user.savedSpots) {
      evaluated++;
      let weather;
      try { weather = await fetchWeather(spot.lat, spot.lon); } catch { continue; }
      if (!weather) continue;
      const opportunity = scoreSpot({ habitat: spot.habitat, species: spot.species, history: spot.history }, weather, now);
      if (!shouldAlert({ opportunity, threshold: user.alertThreshold, lastAlertAt: spot.lastAlertAt }, now)) continue;
      const ok = await sendEmail(user.email, spot, opportunity);
      if (ok) {
        await prisma.savedSpot.update({ where: { id: spot.id }, data: { lastAlertAt: now } });
        sent++;
      }
    }
  }
  return { evaluated, sent };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && npx vitest run test/alerts-run.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Create the real script entry + npm script**

`backend/src/alerts/cron.js`:
```js
import { runAlerts } from "./run.js";
import { sendAlertEmail } from "./mailer.js";
import { prisma } from "../db.js";

async function fetchWeather(lat, lon) {
  const u = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=wind_speed_10m,pressure_msl,cloud_cover&daily=temperature_2m_max,temperature_2m_min,precipitation_sum` +
    `&past_days=5&forecast_days=1&timezone=America%2FToronto`;
  const r = await fetch(u); if (!r.ok) throw new Error("wx");
  const d = await r.json();
  const dm = d.daily, n = dm.time.length;
  let sum = 0, c = 0;
  for (let i = Math.max(0, n - 3); i < n; i++) { sum += (dm.temperature_2m_max[i] + dm.temperature_2m_min[i]) / 2; c++; }
  const airMean = c ? sum / c : 15;
  let days = null;
  for (let i = n - 1; i >= 0; i--) { if ((dm.precipitation_sum[i] || 0) > 2) { days = n - 1 - i; break; } }
  if (days == null) days = n + 1;
  const p48 = (dm.precipitation_sum[n-1] || 0) + (dm.precipitation_sum[n-2] || 0);
  const flow = p48 >= 35 ? "Blown out" : p48 >= 12 ? "High / stained" : days >= 6 ? "Low / clear" : "Normal";
  return { airMean, days, flow, wind: d.current?.wind_speed_10m, cloud: d.current?.cloud_cover, pressureTrend: null };
}

runAlerts({ fetchWeather, sendEmail: sendAlertEmail })
  .then((r) => { console.log("alerts:", r); return prisma.$disconnect(); })
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
```
Add to `backend/package.json` scripts: `"alerts:run": "node --env-file-if-exists=.env src/alerts/cron.js"`.

- [ ] **Step 6: Commit**

```bash
git add backend/src/alerts backend/package.json backend/test/alerts-run.test.js && git commit -m "feat(backend): alert runner + cron script"
```

- [ ] **Step 7: `⚙️ YOU PROVIDE` live email test**

Add a real `RESEND_API_KEY` + `EMAIL_FROM` to `backend/.env`, sign up a user, save a spot in cool conditions, then `npm run alerts:run` and confirm the email arrives. On Render this becomes a **Cron Job** running the same command hourly.

---

### Task 7: Frontend — store scoring inputs on save + sync on login

**Files:** Modify `source-app.jsx`

**Interfaces:** When `API_BASE` is set and the user is signed in, `toggleSave` also POSTs the spot (with `habitat`/`species`/`history`) to `/saved-spots` and delete calls `DELETE /saved-spots/:ref`; on load, local saved spots are merged up once.

- [ ] **Step 1: Extend the save payload + sync**

In `source-app.jsx`, in `toggleSave`, when saving include the scoring inputs and (if `API_BASE`) POST them:
```js
  const toggleSave=useCallback((sec)=>{
    setSaved(prev=>{ const ex=prev.some(s=>s.id===sec.id);
      const rec={id:sec.id,label:sec.river,section:sec.section,lat:sec.lat,lon:sec.lon,
        habitat:sec.h,species:sec.species,history:sec.history,source:sec.source||"verified",savedAt:new Date().toISOString()};
      const next= ex? prev.filter(s=>s.id!==sec.id) : [...prev,rec];
      dbSet("saved",next);
      if(API_BASE){
        if(ex) proxyJSON(`/saved-spots/${encodeURIComponent(sec.id)}`,{method:"DELETE"}).catch(()=>{});
        else proxyJSON("/saved-spots",{method:"POST",body:{ref:sec.id,river:sec.river,section:sec.section,lat:sec.lat,lon:sec.lon,source:rec.source,habitat:sec.h,species:sec.species,history:sec.history}}).catch(()=>{});
      }
      return next; });
  },[]);
```
> This assumes `proxyJSON(path, { method, body })` (from Phase 3) sends credentials and JSON. If `proxyJSON` only does GET, add method/body support there.

- [ ] **Step 2: One-time sync of existing local spots on load**

In the startup effect (where `dbGet("saved")` runs), after setting local saved spots, if `API_BASE`, push any not yet on the server:
```js
      const sv=await dbGet("saved"); if(Array.isArray(sv)){ setSaved(sv);
        if(API_BASE && !(await dbGet("saved:synced"))){
          for(const s of sv){ if(s.habitat) proxyJSON("/saved-spots",{method:"POST",body:{ref:s.id,river:s.label,section:s.section,lat:s.lat,lon:s.lon,source:s.source||"verified",habitat:s.habitat,species:s.species||[],history:s.history??60}}).catch(()=>{}); }
          dbSet("saved:synced",true);
        }
      }
```

- [ ] **Step 3: Build + test**

Run: `cd /Users/faheemafridi/river-intel-pwa && npm run build && npm test`
Expected: `built app.js`, 24/24 pass (no `API_BASE` → no network calls).

- [ ] **Step 4: Commit**

```bash
git add source-app.jsx app.js && git commit -m "feat(frontend): sync saved spots + scoring inputs to backend"
```

---

### Task 8: Phase wrap

- [ ] **Step 1: Full suites**

Run: `cd backend && npm test` then `cd /Users/faheemafridi/river-intel-pwa && npm run build && npm test`
Expected: backend all green; frontend 24/24.

- [ ] **Step 2: Tag**

```bash
git commit --allow-empty -m "chore: B phase 5 (saved spots + email alerts) complete"
```

---

## Self-Review

**Spec coverage (Phase 5 of B):** server-side saved spots + one-time migration (Tasks 1, 4, 7), alert preferences (1, 4), the prime-conditions evaluator (2), de-dup decision (3), Resend email (5), and the scheduled runner/cron (6). Push notifications remain deferred (email first, per spec).

**Placeholder scan:** no TBD/TODO; complete code throughout. `⚙️ YOU PROVIDE` = a real Resend key for the live email send (Task 6 Step 7). All logic (evaluator, decision, runner, mailer) is tested without Resend via injected deps.

**Deliberate deviation, documented:** the backend evaluator (`score.js`) is a **bounded port** of the frontend engine — it reproduces the app's water/weather/seasonal/time/habitat blend and warm-water penalty from stored `habitat`/`species`/`history` + live weather, but is a separate copy of `SPECIES_ACT`. Unifying both behind one shared engine is a future refactor; for now the numbers track closely enough to trigger prime alerts.

**Type/name consistency:** `scoreSpot({habitat,species,history}, weather, now)` is called identically in `run.js` and tested directly. `shouldAlert({opportunity,threshold,lastAlertAt}, now)` matches across `decide.js` and `run.js`. `SavedSpot` fields (`ref,river,section,lat,lon,source,habitat,species,history,lastAlertAt`) are what the routes write, the runner reads, and the frontend sends. `sendAlertEmail(to, spot, opportunity, {fetchImpl})` matches the runner's injected `sendEmail(user.email, spot, opportunity)` call.
