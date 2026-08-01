# Production Foundation — Phase 1: Backend Skeleton + Auth — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the custom Node backend with accounts — email/password sign-up + login, sessions, and Google OAuth — so the app has real users to attach subscriptions and saved data to.

**Architecture:** A Fastify + Prisma + Postgres API in a new `backend/` directory (monorepo; deployed to Render later). Sessions use a random opaque token stored hashed in Postgres and sent as an `httpOnly` cookie. Passwords hashed with Node's built-in `crypto.scrypt`. Google OAuth via `arctic`. No deprecated auth library (Lucia-as-a-library is EOL; we use its underlying pattern directly).

**Tech Stack:** Node 20+ (ESM), Fastify, Prisma, PostgreSQL, `arctic` (Google OAuth), Vitest for tests, `@fastify/cors`, `@fastify/cookie`, `@fastify/rate-limit`.

## Global Constraints

- Backend lives in `backend/`; the existing PWA at repo root is untouched by this phase.
- ESM JavaScript (`"type": "module"`), matching the repo's style (no TypeScript).
- Secrets only via environment variables (`.env` locally, Render env later); never committed. `backend/.env` is git-ignored.
- Passwords: `crypto.scrypt` with a per-user random salt; never store plaintext.
- Sessions: store only a SHA-256 hash of the token in the DB; cookie is `httpOnly`, `SameSite=Lax`, `Secure` in production.
- All new logic is tested with Vitest against a real Postgres test database (not mocks) for DB-touching code.
- `⚙️ YOU PROVIDE` steps require the user's credentials/services and cannot be completed by the agent alone.

---

### Task 0: Backend project scaffold

**Files:**
- Create: `backend/package.json`, `backend/.gitignore`, `backend/.env.example`, `backend/src/config.js`, `backend/src/app.js`, `backend/src/server.js`, `backend/vitest.config.js`

**Interfaces:**
- Produces: `buildApp()` → a configured Fastify instance (no `listen`); `config` object of validated env vars; `npm --prefix backend test` and `npm --prefix backend run dev`.

- [ ] **Step 1: Create `backend/package.json`**

```json
{
  "name": "muddy-york-backend",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "node --watch src/server.js",
    "start": "node src/server.js",
    "test": "vitest run",
    "db:migrate": "prisma migrate dev",
    "db:deploy": "prisma migrate deploy",
    "db:generate": "prisma generate"
  },
  "dependencies": {
    "@fastify/cookie": "^10.0.0",
    "@fastify/cors": "^10.0.0",
    "@fastify/rate-limit": "^10.0.0",
    "@prisma/client": "^5.20.0",
    "arctic": "^2.0.0",
    "fastify": "^5.0.0"
  },
  "devDependencies": {
    "prisma": "^5.20.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create `backend/.gitignore`**

```
node_modules/
.env
```

- [ ] **Step 3: Create `backend/.env.example`**

```
DATABASE_URL=postgresql://user:pass@localhost:5432/muddyyork
SESSION_COOKIE_NAME=my_session
FRONTEND_ORIGIN=http://localhost:8000
NODE_ENV=development
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
```

- [ ] **Step 4: Create `backend/src/config.js`**

```js
function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}
export const config = {
  env: process.env.NODE_ENV || "development",
  isProd: process.env.NODE_ENV === "production",
  databaseUrl: required("DATABASE_URL"),
  cookieName: process.env.SESSION_COOKIE_NAME || "my_session",
  frontendOrigin: process.env.FRONTEND_ORIGIN || "http://localhost:8000",
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    redirectUri: process.env.GOOGLE_REDIRECT_URI || "",
  },
};
```

- [ ] **Step 5: Create `backend/src/app.js`**

```js
import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import { config } from "./config.js";

export function buildApp() {
  const app = Fastify({ logger: true });
  app.register(cors, { origin: config.frontendOrigin, credentials: true });
  app.register(cookie);
  app.register(rateLimit, { max: 100, timeWindow: "1 minute" });
  app.get("/health", async () => ({ ok: true }));
  return app;
}
```

- [ ] **Step 6: Create `backend/src/server.js`**

```js
import { buildApp } from "./app.js";

const app = buildApp();
const port = Number(process.env.PORT) || 3000;
app.listen({ port, host: "0.0.0.0" }).catch((e) => {
  app.log.error(e);
  process.exit(1);
});
```

- [ ] **Step 7: Create `backend/vitest.config.js`**

```js
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { include: ["src/**/*.test.js", "test/**/*.test.js"], environment: "node" },
});
```

- [ ] **Step 8: Install and smoke-test**

`⚙️ YOU PROVIDE` a Postgres URL for `.env` before later tasks; for this step just verify boot with a dummy value:

```bash
cd backend && npm install && cp .env.example .env
# put any value in DATABASE_URL for this boot test
node -e "import('./src/app.js').then(m=>m.buildApp().inject({method:'GET',url:'/health'})).then(r=>console.log(r.json()))"
```
Expected: `{ ok: true }`

- [ ] **Step 9: Commit**

```bash
cd /Users/faheemafridi/river-intel-pwa
git add backend && git commit -m "feat(backend): fastify skeleton with cors, cookies, rate limit, health"
```

---

### Task 1: Postgres + Prisma schema (users & sessions)

**Files:**
- Create: `backend/prisma/schema.prisma`, `backend/src/db.js`

**Interfaces:**
- Produces: Prisma models `User` and `Session`; `prisma` client exported from `db.js`.

- [ ] **Step 1: `⚙️ YOU PROVIDE` a Postgres database**

Either run a local one:
```bash
docker run --name muddy-pg -e POSTGRES_PASSWORD=pass -e POSTGRES_DB=muddyyork -p 5432:5432 -d postgres:16
```
…or create a free Neon dev database. Put the connection string in `backend/.env` as `DATABASE_URL`.

- [ ] **Step 2: Create `backend/prisma/schema.prisma`**

```prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }

model User {
  id            String    @id @default(cuid())
  email         String    @unique
  emailVerified Boolean   @default(false)
  passwordHash  String?
  googleId      String?   @unique
  createdAt     DateTime  @default(now())
  sessions      Session[]
}

model Session {
  id        String   @id
  userId    String
  expiresAt DateTime
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

- [ ] **Step 3: Create `backend/src/db.js`**

```js
import { PrismaClient } from "@prisma/client";
export const prisma = new PrismaClient();
```

- [ ] **Step 4: Generate client and run first migration**

```bash
cd backend && npx prisma migrate dev --name init
```
Expected: migration applied, `User` and `Session` tables created.

- [ ] **Step 5: Commit**

```bash
git add backend/prisma backend/src/db.js && git commit -m "feat(backend): prisma schema for users and sessions"
```

---

### Task 2: Password hashing (pure, TDD)

**Files:**
- Create: `backend/src/auth/password.js`, `backend/src/auth/password.test.js`

**Interfaces:**
- Produces: `hashPassword(plain) => Promise<string>` (format `salt:derived`, both hex) and `verifyPassword(plain, stored) => Promise<boolean>` using `crypto.scrypt` with a constant-time compare.

- [ ] **Step 1: Write the failing test**

`backend/src/auth/password.test.js`:
```js
import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./password.js";

describe("password hashing", () => {
  it("verifies a correct password and rejects a wrong one", async () => {
    const stored = await hashPassword("correct horse");
    expect(stored).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
    expect(await verifyPassword("correct horse", stored)).toBe(true);
    expect(await verifyPassword("wrong", stored)).toBe(false);
  });
  it("produces a different hash each time (random salt)", async () => {
    const a = await hashPassword("same");
    const b = await hashPassword("same");
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npx vitest run src/auth/password.test.js`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement**

`backend/src/auth/password.js`:
```js
import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
const scryptAsync = promisify(scrypt);

export async function hashPassword(plain) {
  const salt = randomBytes(16);
  const derived = await scryptAsync(plain, salt, 64);
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}
export async function verifyPassword(plain, stored) {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const derived = await scryptAsync(plain, Buffer.from(saltHex, "hex"), 64);
  const expected = Buffer.from(hashHex, "hex");
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && npx vitest run src/auth/password.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/auth/password.js backend/src/auth/password.test.js && git commit -m "feat(backend): scrypt password hashing"
```

---

### Task 3: Session management

**Files:**
- Create: `backend/src/auth/session.js`, `backend/test/session.test.js`, `backend/test/helpers/db.js`

**Interfaces:**
- Consumes: `prisma` from `db.js`.
- Produces:
  - `createSession(userId) => Promise<{ token, expiresAt }>` (token is the raw value for the cookie; DB stores its SHA-256 hash as `Session.id`)
  - `validateSession(token) => Promise<{ user } | null>` (null when missing/expired; deletes expired)
  - `invalidateSession(token) => Promise<void>`

- [ ] **Step 1: Create the test DB helper**

`backend/test/helpers/db.js`:
```js
import { prisma } from "../../src/db.js";
export async function resetDb() {
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
}
```

- [ ] **Step 2: Write the failing test**

`backend/test/session.test.js`:
```js
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "../src/db.js";
import { resetDb } from "./helpers/db.js";
import { createSession, validateSession, invalidateSession } from "../src/auth/session.js";

async function makeUser() {
  return prisma.user.create({ data: { email: `u${Date.now()}@x.com` } });
}

describe("sessions", () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  it("creates and validates a session", async () => {
    const u = await makeUser();
    const { token } = await createSession(u.id);
    const res = await validateSession(token);
    expect(res.user.id).toBe(u.id);
  });
  it("returns null for a bad token", async () => {
    expect(await validateSession("nope")).toBe(null);
  });
  it("invalidates a session", async () => {
    const u = await makeUser();
    const { token } = await createSession(u.id);
    await invalidateSession(token);
    expect(await validateSession(token)).toBe(null);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd backend && npx vitest run test/session.test.js`
Expected: FAIL — cannot find module `../src/auth/session.js`.

- [ ] **Step 4: Implement**

`backend/src/auth/session.js`:
```js
import { randomBytes, createHash } from "node:crypto";
import { prisma } from "../db.js";

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
const sha256 = (s) => createHash("sha256").update(s).digest("hex");

export async function createSession(userId) {
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + THIRTY_DAYS);
  await prisma.session.create({ data: { id: sha256(token), userId, expiresAt } });
  return { token, expiresAt };
}
export async function validateSession(token) {
  if (!token) return null;
  const row = await prisma.session.findUnique({ where: { id: sha256(token) }, include: { user: true } });
  if (!row) return null;
  if (row.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { id: row.id } }).catch(() => {});
    return null;
  }
  return { user: row.user };
}
export async function invalidateSession(token) {
  if (!token) return;
  await prisma.session.delete({ where: { id: sha256(token) } }).catch(() => {});
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd backend && npx vitest run test/session.test.js`
Expected: PASS (3 tests). (Requires the Postgres from Task 1.)

- [ ] **Step 6: Commit**

```bash
git add backend/src/auth/session.js backend/test && git commit -m "feat(backend): hashed session tokens with expiry"
```

---

### Task 4: Email/password signup, login, logout, and /me routes

**Files:**
- Create: `backend/src/routes/auth.js`, `backend/src/auth/current-user.js`, `backend/test/auth-routes.test.js`
- Modify: `backend/src/app.js` (register the auth routes)

**Interfaces:**
- Consumes: `hashPassword`/`verifyPassword`, `createSession`/`validateSession`/`invalidateSession`, `config`, `prisma`.
- Produces routes: `POST /auth/signup`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`; and `getCurrentUser(req) => Promise<user|null>` reading the session cookie.

- [ ] **Step 1: Write the failing test**

`backend/test/auth-routes.test.js`:
```js
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { resetDb } from "./helpers/db.js";

const app = buildApp();
const cookieName = process.env.SESSION_COOKIE_NAME || "my_session";

describe("auth routes", () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  it("signs up, sets a cookie, and returns the user from /me", async () => {
    const signup = await app.inject({ method: "POST", url: "/auth/signup",
      payload: { email: "a@b.com", password: "supersecret1" } });
    expect(signup.statusCode).toBe(200);
    const cookie = signup.cookies.find((c) => c.name === cookieName);
    expect(cookie).toBeTruthy();
    const me = await app.inject({ method: "GET", url: "/auth/me",
      cookies: { [cookieName]: cookie.value } });
    expect(me.json().user.email).toBe("a@b.com");
  });
  it("rejects a duplicate email", async () => {
    await app.inject({ method: "POST", url: "/auth/signup", payload: { email: "d@b.com", password: "supersecret1" } });
    const dup = await app.inject({ method: "POST", url: "/auth/signup", payload: { email: "d@b.com", password: "supersecret1" } });
    expect(dup.statusCode).toBe(409);
  });
  it("logs in with correct creds and rejects wrong ones", async () => {
    await app.inject({ method: "POST", url: "/auth/signup", payload: { email: "l@b.com", password: "supersecret1" } });
    const ok = await app.inject({ method: "POST", url: "/auth/login", payload: { email: "l@b.com", password: "supersecret1" } });
    expect(ok.statusCode).toBe(200);
    const bad = await app.inject({ method: "POST", url: "/auth/login", payload: { email: "l@b.com", password: "wrong" } });
    expect(bad.statusCode).toBe(401);
  });
  it("returns null user when unauthenticated", async () => {
    const me = await app.inject({ method: "GET", url: "/auth/me" });
    expect(me.json().user).toBe(null);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npx vitest run test/auth-routes.test.js`
Expected: FAIL — routes/module not found.

- [ ] **Step 3: Implement the current-user helper**

`backend/src/auth/current-user.js`:
```js
import { config } from "../config.js";
import { validateSession } from "./session.js";
export async function getCurrentUser(req) {
  const token = req.cookies?.[config.cookieName];
  if (!token) return null;
  const res = await validateSession(token);
  return res ? res.user : null;
}
```

- [ ] **Step 4: Implement the routes**

`backend/src/routes/auth.js`:
```js
import { prisma } from "../db.js";
import { config } from "../config.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { createSession, invalidateSession } from "../auth/session.js";
import { getCurrentUser } from "../auth/current-user.js";

function setSessionCookie(reply, token, expiresAt) {
  reply.setCookie(config.cookieName, token, {
    httpOnly: true, sameSite: "lax", secure: config.isProd, path: "/", expires: expiresAt,
  });
}
const publicUser = (u) => ({ id: u.id, email: u.email, emailVerified: u.emailVerified });

export default async function authRoutes(app) {
  app.post("/auth/signup", async (req, reply) => {
    const { email, password } = req.body || {};
    if (!email || !password || password.length < 8)
      return reply.code(400).send({ error: "email and 8+ char password required" });
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return reply.code(409).send({ error: "email already registered" });
    const user = await prisma.user.create({ data: { email, passwordHash: await hashPassword(password) } });
    const { token, expiresAt } = await createSession(user.id);
    setSessionCookie(reply, token, expiresAt);
    return { user: publicUser(user) };
  });

  app.post("/auth/login", async (req, reply) => {
    const { email, password } = req.body || {};
    const user = email ? await prisma.user.findUnique({ where: { email } }) : null;
    if (!user || !user.passwordHash || !(await verifyPassword(password || "", user.passwordHash)))
      return reply.code(401).send({ error: "invalid credentials" });
    const { token, expiresAt } = await createSession(user.id);
    setSessionCookie(reply, token, expiresAt);
    return { user: publicUser(user) };
  });

  app.post("/auth/logout", async (req, reply) => {
    await invalidateSession(req.cookies?.[config.cookieName]);
    reply.clearCookie(config.cookieName, { path: "/" });
    return { ok: true };
  });

  app.get("/auth/me", async (req) => {
    const user = await getCurrentUser(req);
    return { user: user ? publicUser(user) : null };
  });
}
```

- [ ] **Step 5: Register the routes in `app.js`**

In `backend/src/app.js`, add the import and registration inside `buildApp` (after the rate-limit register, before the `/health` route):
```js
import authRoutes from "./routes/auth.js";
// ...
  app.register(authRoutes);
```

- [ ] **Step 6: Run to verify it passes**

Run: `cd backend && npx vitest run test/auth-routes.test.js`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add backend/src backend/test/auth-routes.test.js && git commit -m "feat(backend): email/password signup, login, logout, /me"
```

---

### Task 5: Google OAuth (arctic)

**Files:**
- Create: `backend/src/routes/google.js`
- Modify: `backend/src/app.js` (register google routes)

**Interfaces:**
- Consumes: `arctic`'s `Google`, `config.google`, `prisma`, `createSession`.
- Produces routes: `GET /auth/google` (redirect to Google with state + PKCE cookies) and `GET /auth/google/callback` (exchange code, upsert user by `googleId`/email, create session, redirect to the frontend).

- [ ] **Step 1: `⚙️ YOU PROVIDE` Google OAuth credentials**

In Google Cloud Console: create an OAuth 2.0 Client (Web), authorized redirect URI `http://localhost:3000/auth/google/callback`. Put `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` in `backend/.env`.

- [ ] **Step 2: Implement the routes**

`backend/src/routes/google.js`:
```js
import { Google, generateState, generateCodeVerifier } from "arctic";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { createSession } from "../auth/session.js";

function client() {
  return new Google(config.google.clientId, config.google.clientSecret, config.google.redirectUri);
}
const secure = { httpOnly: true, sameSite: "lax", secure: config.isProd, path: "/", maxAge: 600 };

export default async function googleRoutes(app) {
  app.get("/auth/google", async (req, reply) => {
    const state = generateState();
    const verifier = generateCodeVerifier();
    const url = client().createAuthorizationURL(state, verifier, ["openid", "email"]);
    reply.setCookie("g_state", state, secure);
    reply.setCookie("g_verifier", verifier, secure);
    return reply.redirect(url.toString());
  });

  app.get("/auth/google/callback", async (req, reply) => {
    const { code, state } = req.query || {};
    const storedState = req.cookies?.g_state;
    const verifier = req.cookies?.g_verifier;
    if (!code || !state || state !== storedState || !verifier)
      return reply.code(400).send({ error: "invalid oauth state" });
    let tokens;
    try { tokens = await client().validateAuthorizationCode(code, verifier); }
    catch { return reply.code(400).send({ error: "code exchange failed" }); }
    const claims = decodeIdToken(tokens.idToken());
    const googleId = claims.sub, email = claims.email;
    let user = await prisma.user.findFirst({ where: { OR: [{ googleId }, { email }] } });
    if (!user) user = await prisma.user.create({ data: { email, googleId, emailVerified: true } });
    else if (!user.googleId) user = await prisma.user.update({ where: { id: user.id }, data: { googleId, emailVerified: true } });
    const { token, expiresAt } = await createSession(user.id);
    reply.setCookie(config.cookieName, token, { httpOnly: true, sameSite: "lax", secure: config.isProd, path: "/", expires: expiresAt });
    return reply.redirect(config.frontendOrigin);
  });
}

function decodeIdToken(jwt) {
  const payload = jwt.split(".")[1];
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}
```

- [ ] **Step 3: Register in `app.js`**

Add to `backend/src/app.js`:
```js
import googleRoutes from "./routes/google.js";
// inside buildApp, near authRoutes:
  app.register(googleRoutes);
```

- [ ] **Step 4: Manual verification** `⚙️ YOU PROVIDE` (needs real Google creds)

```bash
cd backend && npm run dev
```
Open `http://localhost:3000/auth/google`, complete Google sign-in, confirm you're redirected to the frontend origin and a `User` row with `googleId` exists (`npx prisma studio`).

Automated coverage for the pure `decodeIdToken` helper:

`backend/test/google.test.js`:
```js
import { describe, it, expect } from "vitest";
import { decodeIdToken } from "../src/routes/google.js";
```
> Note: export `decodeIdToken` from `google.js` (add `export` to its declaration) to make this import work.
```js
describe("decodeIdToken", () => {
  it("decodes the JWT payload", () => {
    const payload = Buffer.from(JSON.stringify({ sub: "123", email: "g@x.com" })).toString("base64url");
    const jwt = `h.${payload}.s`;
    expect(decodeIdToken(jwt)).toEqual({ sub: "123", email: "g@x.com" });
  });
});
```

- [ ] **Step 5: Export the helper and run its test**

Change `function decodeIdToken` to `export function decodeIdToken` in `google.js`.
Run: `cd backend && npx vitest run test/google.test.js`
Expected: PASS (1 test).

- [ ] **Step 6: Commit**

```bash
git add backend/src backend/test/google.test.js && git commit -m "feat(backend): google oauth sign-in via arctic"
```

---

### Task 6: Full suite + phase wrap

**Files:** none (verification only)

- [ ] **Step 1: Run the whole backend suite**

Run: `cd backend && npm test`
Expected: all suites pass (password, session, auth-routes, google).

- [ ] **Step 2: Confirm the frontend build is still green (untouched)**

Run: `cd /Users/faheemafridi/river-intel-pwa && npm run build && npm test`
Expected: `built app.js`, 24/24 tests pass.

- [ ] **Step 3: Commit any final touches and tag the phase**

```bash
git commit --allow-empty -m "chore: B phase 1 (backend skeleton + auth) complete"
```

---

## Self-Review

**Spec coverage (Phase 1 slice of B):** backend skeleton (Task 0), Postgres+Prisma (Task 1), auth core — password (2), sessions (3), email/password routes (4), Google OAuth (5), suite (6). Stripe/entitlements, data proxy, measured conditions, and alerts are **out of Phase 1 by design** — each is its own phase/plan.

**Placeholder scan:** no TBD/TODO; every code step shows complete code. Steps needing user-owned services are explicitly marked `⚙️ YOU PROVIDE` (Postgres URL, Google creds) — these are real external prerequisites, not placeholders.

**Type/name consistency:** `config.cookieName` used consistently across `session`, `current-user`, `auth`, `google`. `createSession` returns `{ token, expiresAt }` and is consumed that way in both route files. `getCurrentUser(req)` and `validateSession(token)` signatures match their call sites. `decodeIdToken` is exported before its test imports it (Task 5 Step 5).

**External-dependency note:** Tasks 1, 3, 4 require a running Postgres; Task 5 requires Google OAuth credentials. The agent can write all code and the pure-function tests without these; DB/OAuth-touching verification needs the `⚙️ YOU PROVIDE` items.
