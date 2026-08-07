# Production Foundation — Phase 2: Stripe + Entitlements + Paywall — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user start a 14-day trial on signup, subscribe via Stripe Checkout, manage/cancel via the Customer Portal, and have premium API routes gated by a server-verified entitlement — with subscription state kept in sync via Stripe webhooks.

**Architecture:** Builds on the Phase-1 Fastify/Prisma/Postgres backend. Adds a `Subscription` model + trial/customer fields, a pure entitlement resolver, Stripe Checkout + Billing Portal endpoints, a signature-verified webhook that upserts subscription state, and a `requirePremium` guard. Most of it is testable without live Stripe by mocking the Stripe client and using Stripe's own test-signature helper for webhooks.

**Tech Stack:** `stripe` Node SDK, Fastify, Prisma, Postgres, Vitest.

## Global Constraints

- All new backend code lives under `backend/`; ESM JavaScript.
- Entitlement is enforced **server-side** on every premium route; the client UI gate (Phase D) is convenience only.
- Trial is app-level: `User.trialEnd = now + 14 days` at signup, **no card required**.
- Stripe secrets (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, price IDs) come from env vars, never committed.
- Webhook route reads the **raw request body** for signature verification (JSON parsing disabled for that route only).
- Tests never call live Stripe: the Stripe client is injected/mocked, and webhook tests use `stripe.webhooks.generateTestHeaderString`.
- `⚙️ YOU PROVIDE` marks steps needing the user's Stripe account (price IDs, keys, live end-to-end checks).

---

### Task 0: Stripe account setup (you) + env

**Files:** Modify `backend/.env.example`

**Interfaces:** Produces the env var names the code reads.

- [ ] **Step 1: `⚙️ YOU PROVIDE` Stripe test-mode setup**

In the Stripe Dashboard (Test mode):
1. Create two recurring Products/Prices: **$9.99/month** and **$59.99/year**. Copy each **Price ID** (`price_...`).
2. **Developers → API keys** → copy the **Secret key** (`sk_test_...`).
3. Webhook secret (`whsec_...`) comes in Task 6 via the Stripe CLI.

- [ ] **Step 2: Add the vars to `backend/.env.example`**

Append:
```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PRICE_MONTHLY=price_...
STRIPE_PRICE_ANNUAL=price_...
STRIPE_WEBHOOK_SECRET=whsec_...
CHECKOUT_SUCCESS_URL=http://localhost:8000/?checkout=success
CHECKOUT_CANCEL_URL=http://localhost:8000/?checkout=cancel
```
And put the real values in your git-ignored `backend/.env`.

- [ ] **Step 3: Extend `backend/src/config.js`**

Add to the exported `config` object:
```js
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || "",
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
    priceMonthly: process.env.STRIPE_PRICE_MONTHLY || "",
    priceAnnual: process.env.STRIPE_PRICE_ANNUAL || "",
    successUrl: process.env.CHECKOUT_SUCCESS_URL || "http://localhost:8000/?checkout=success",
    cancelUrl: process.env.CHECKOUT_CANCEL_URL || "http://localhost:8000/?checkout=cancel",
  },
```

- [ ] **Step 4: Commit**

```bash
cd /Users/faheemafridi/river-intel-pwa
git add backend/.env.example backend/src/config.js && git commit -m "chore(backend): stripe config env vars"
```

---

### Task 1: Schema — Subscription + trial/customer fields

**Files:** Modify `backend/prisma/schema.prisma`

**Interfaces:** Produces `Subscription` model and `User.stripeCustomerId`, `User.trialEnd`.

- [ ] **Step 1: Update the schema**

Add to `User`:
```prisma
  stripeCustomerId String?       @unique
  trialEnd         DateTime?
  subscription     Subscription?
```
Add a new model:
```prisma
model Subscription {
  id               String    @id
  userId           String    @unique
  status           String
  priceId          String?
  currentPeriodEnd DateTime?
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
  user             User      @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

- [ ] **Step 2: Migrate**

```bash
cd backend && npx prisma migrate dev --name add_subscriptions
```
Expected: migration applied; `Subscription` table + new `User` columns created.

- [ ] **Step 3: Commit**

```bash
git add backend/prisma && git commit -m "feat(backend): subscription model + trial/customer fields"
```

---

### Task 2: Entitlement resolver (pure, TDD)

**Files:** Create `backend/src/billing/entitlement.js`, `backend/src/billing/entitlement.test.js`

**Interfaces:** Produces `resolveEntitlement({ status, currentPeriodEnd, trialEnd }, now = new Date()) => "active" | "trialing" | "free"`. `isPremium(entitlement) => boolean`.

- [ ] **Step 1: Write the failing test**

`backend/src/billing/entitlement.test.js`:
```js
import { describe, it, expect } from "vitest";
import { resolveEntitlement, isPremium } from "./entitlement.js";

const future = new Date(Date.now() + 86400000);
const past = new Date(Date.now() - 86400000);

describe("resolveEntitlement", () => {
  it("active subscription with a future period end is active", () => {
    expect(resolveEntitlement({ status: "active", currentPeriodEnd: future, trialEnd: null })).toBe("active");
  });
  it("expired subscription but live trial is trialing", () => {
    expect(resolveEntitlement({ status: "canceled", currentPeriodEnd: past, trialEnd: future })).toBe("trialing");
  });
  it("no subscription and no live trial is free", () => {
    expect(resolveEntitlement({ status: null, currentPeriodEnd: null, trialEnd: past })).toBe("free");
  });
  it("active status but a past period end falls through to trial/free", () => {
    expect(resolveEntitlement({ status: "active", currentPeriodEnd: past, trialEnd: null })).toBe("free");
  });
});

describe("isPremium", () => {
  it("active and trialing are premium; free is not", () => {
    expect(isPremium("active")).toBe(true);
    expect(isPremium("trialing")).toBe(true);
    expect(isPremium("free")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npx vitest run src/billing/entitlement.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`backend/src/billing/entitlement.js`:
```js
export function resolveEntitlement({ status, currentPeriodEnd, trialEnd }, now = new Date()) {
  const t = now.getTime();
  const paidActive = status === "active" && currentPeriodEnd && new Date(currentPeriodEnd).getTime() > t;
  if (paidActive) return "active";
  if (trialEnd && new Date(trialEnd).getTime() > t) return "trialing";
  return "free";
}
export function isPremium(entitlement) {
  return entitlement === "active" || entitlement === "trialing";
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && npx vitest run src/billing/entitlement.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/billing/entitlement.js backend/src/billing/entitlement.test.js && git commit -m "feat(backend): entitlement resolver"
```

---

### Task 3: Start the trial on signup + expose entitlement on /me

**Files:** Modify `backend/src/routes/auth.js`; Create `backend/src/billing/user-entitlement.js`

**Interfaces:** Consumes `resolveEntitlement`. Produces `entitlementForUser(userId) => Promise<"active"|"trialing"|"free">` (reads the user's `trialEnd` + `Subscription`). Signup sets `trialEnd = now + 14 days`. `/auth/me` returns `{ user, entitlement }`.

- [ ] **Step 1: Write the failing test**

`backend/test/trial.test.js`:
```js
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { resetDb } from "./helpers/db.js";

const app = buildApp();
const cookieName = process.env.SESSION_COOKIE_NAME || "my_session";

describe("trial on signup", () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  it("new signup is on a trial and /me reports 'trialing'", async () => {
    const s = await app.inject({ method: "POST", url: "/auth/signup", payload: { email: "t@b.com", password: "supersecret1" } });
    const cookie = s.cookies.find((c) => c.name === cookieName);
    const me = await app.inject({ method: "GET", url: "/auth/me", cookies: { [cookieName]: cookie.value } });
    expect(me.json().entitlement).toBe("trialing");
    const user = await prisma.user.findUnique({ where: { email: "t@b.com" } });
    expect(user.trialEnd.getTime()).toBeGreaterThan(Date.now());
  });
  it("unauthenticated /me is 'free'", async () => {
    const me = await app.inject({ method: "GET", url: "/auth/me" });
    expect(me.json().entitlement).toBe("free");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npx vitest run test/trial.test.js`
Expected: FAIL (entitlement undefined / no trialEnd).

- [ ] **Step 3: Implement the user-entitlement helper**

`backend/src/billing/user-entitlement.js`:
```js
import { prisma } from "../db.js";
import { resolveEntitlement } from "./entitlement.js";

export async function entitlementForUser(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { subscription: true } });
  if (!user) return "free";
  const sub = user.subscription;
  return resolveEntitlement({
    status: sub?.status || null,
    currentPeriodEnd: sub?.currentPeriodEnd || null,
    trialEnd: user.trialEnd || null,
  });
}
```

- [ ] **Step 4: Set the trial at signup and return entitlement from /me**

In `backend/src/routes/auth.js`:
- Add import: `import { entitlementForUser } from "../billing/user-entitlement.js";`
- In `POST /auth/signup`, change the user creation to set the trial:
```js
    const trialEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const user = await prisma.user.create({ data: { email, passwordHash: await hashPassword(password), trialEnd } });
```
- Replace the `GET /auth/me` handler with:
```js
  app.get("/auth/me", async (req) => {
    const user = await getCurrentUser(req);
    if (!user) return { user: null, entitlement: "free" };
    return { user: publicUser(user), entitlement: await entitlementForUser(user.id) };
  });
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd backend && npx vitest run test/trial.test.js`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/src && git commit -m "feat(backend): 14-day trial on signup; entitlement on /me"
```

---

### Task 4: Stripe client + Checkout endpoint

**Files:** Create `backend/src/billing/stripe.js`, `backend/src/routes/billing.js`; Modify `backend/src/app.js`

**Interfaces:** Produces `getStripe()` (lazy singleton) and `POST /billing/checkout` (`{ plan: "monthly"|"annual" }` → `{ url }`), auth-required. Ensures the user has a Stripe customer (`stripeCustomerId`).

- [ ] **Step 1: Install the Stripe SDK**

```bash
cd backend && npm install stripe@^17.0.0
```

- [ ] **Step 2: Create the Stripe client wrapper**

`backend/src/billing/stripe.js`:
```js
import Stripe from "stripe";
import { config } from "../config.js";
let _stripe = null;
export function getStripe() {
  if (!_stripe) _stripe = new Stripe(config.stripe.secretKey);
  return _stripe;
}
```

- [ ] **Step 3: Write the failing test (mocked Stripe)**

`backend/test/checkout.test.js`:
```js
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "../src/db.js";
import { resetDb } from "./helpers/db.js";

vi.mock("../src/billing/stripe.js", () => ({
  getStripe: () => ({
    customers: { create: vi.fn().mockResolvedValue({ id: "cus_test" }) },
    checkout: { sessions: { create: vi.fn().mockResolvedValue({ url: "https://checkout.stripe.test/abc" }) } },
  }),
}));

const { buildApp } = await import("../src/app.js");
const app = buildApp();
const cookieName = process.env.SESSION_COOKIE_NAME || "my_session";

async function signup(email) {
  const s = await app.inject({ method: "POST", url: "/auth/signup", payload: { email, password: "supersecret1" } });
  return s.cookies.find((c) => c.name === cookieName).value;
}

describe("POST /billing/checkout", () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  it("returns a checkout url for an authed user and stores the customer id", async () => {
    const token = await signup("c@b.com");
    const res = await app.inject({ method: "POST", url: "/billing/checkout",
      cookies: { [cookieName]: token }, payload: { plan: "monthly" } });
    expect(res.statusCode).toBe(200);
    expect(res.json().url).toContain("checkout.stripe.test");
    const user = await prisma.user.findUnique({ where: { email: "c@b.com" } });
    expect(user.stripeCustomerId).toBe("cus_test");
  });
  it("401s when unauthenticated", async () => {
    const res = await app.inject({ method: "POST", url: "/billing/checkout", payload: { plan: "monthly" } });
    expect(res.statusCode).toBe(401);
  });
});
```

- [ ] **Step 4: Run to verify it fails**

Run: `cd backend && npx vitest run test/checkout.test.js`
Expected: FAIL — route not found.

- [ ] **Step 5: Implement the billing routes**

`backend/src/routes/billing.js`:
```js
import { prisma } from "../db.js";
import { config } from "../config.js";
import { getStripe } from "../billing/stripe.js";
import { getCurrentUser } from "../auth/current-user.js";

async function ensureCustomer(user) {
  if (user.stripeCustomerId) return user.stripeCustomerId;
  const customer = await getStripe().customers.create({ email: user.email, metadata: { userId: user.id } });
  await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: customer.id } });
  return customer.id;
}

export default async function billingRoutes(app) {
  app.post("/billing/checkout", async (req, reply) => {
    const user = await getCurrentUser(req);
    if (!user) return reply.code(401).send({ error: "not authenticated" });
    const plan = req.body?.plan === "annual" ? "annual" : "monthly";
    const price = plan === "annual" ? config.stripe.priceAnnual : config.stripe.priceMonthly;
    const customerId = await ensureCustomer(user);
    const session = await getStripe().checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price, quantity: 1 }],
      client_reference_id: user.id,
      success_url: config.stripe.successUrl,
      cancel_url: config.stripe.cancelUrl,
    });
    return { url: session.url };
  });
}
```

- [ ] **Step 6: Register in `app.js`**

Add to `backend/src/app.js`:
```js
import billingRoutes from "./routes/billing.js";
// inside buildApp, near the other route registrations:
  app.register(billingRoutes);
```

- [ ] **Step 7: Run to verify it passes**

Run: `cd backend && npx vitest run test/checkout.test.js`
Expected: PASS (2 tests).

- [ ] **Step 8: Commit**

```bash
git add backend/src backend/package.json backend/package-lock.json && git commit -m "feat(backend): stripe client + checkout endpoint"
```

---

### Task 5: Customer Portal endpoint

**Files:** Modify `backend/src/routes/billing.js`

**Interfaces:** Produces `POST /billing/portal` → `{ url }`; 400 if the user has no Stripe customer yet.

- [ ] **Step 1: Write the failing test**

Append to `backend/test/checkout.test.js` (extend the mock's return in Step 3 mock to include `billingPortal`): update the `vi.mock` factory to add:
```js
    billingPortal: { sessions: { create: vi.fn().mockResolvedValue({ url: "https://portal.stripe.test/xyz" }) } },
```
Then add a test:
```js
it("returns a portal url once the user has a customer id", async () => {
  const token = await signup("p@b.com");
  await app.inject({ method: "POST", url: "/billing/checkout", cookies: { [cookieName]: token }, payload: { plan: "monthly" } });
  const res = await app.inject({ method: "POST", url: "/billing/portal", cookies: { [cookieName]: token } });
  expect(res.statusCode).toBe(200);
  expect(res.json().url).toContain("portal.stripe.test");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npx vitest run test/checkout.test.js`
Expected: FAIL — `/billing/portal` not found.

- [ ] **Step 3: Implement**

Add to `backend/src/routes/billing.js` inside `billingRoutes`:
```js
  app.post("/billing/portal", async (req, reply) => {
    const user = await getCurrentUser(req);
    if (!user) return reply.code(401).send({ error: "not authenticated" });
    if (!user.stripeCustomerId) return reply.code(400).send({ error: "no billing account yet" });
    const session = await getStripe().billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: config.stripe.successUrl,
    });
    return { url: session.url };
  });
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && npx vitest run test/checkout.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src backend/test/checkout.test.js && git commit -m "feat(backend): customer portal endpoint"
```

---

### Task 6: Stripe webhook (signature-verified, raw body)

**Files:** Create `backend/src/routes/stripe-webhook.js`; Modify `backend/src/app.js`

**Interfaces:** Produces `POST /webhooks/stripe`. Verifies the signature, then on `checkout.session.completed` / `customer.subscription.updated` / `customer.subscription.deleted` upserts the `Subscription` row for the user.

- [ ] **Step 1: Write the failing test (uses Stripe's test-signature helper — no live calls)**

`backend/test/webhook.test.js`:
```js
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import Stripe from "stripe";
import { prisma } from "../src/db.js";
import { resetDb } from "./helpers/db.js";

process.env.STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "whsec_test_secret";
const { buildApp } = await import("../src/app.js");
const app = buildApp();
const stripe = new Stripe("sk_test_dummy");
const secret = process.env.STRIPE_WEBHOOK_SECRET;

function signed(event) {
  const payload = JSON.stringify(event);
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
  return { payload, header };
}

describe("POST /webhooks/stripe", () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  it("rejects a bad signature", async () => {
    const res = await app.inject({ method: "POST", url: "/webhooks/stripe",
      headers: { "stripe-signature": "bad", "content-type": "application/json" }, payload: JSON.stringify({}) });
    expect(res.statusCode).toBe(400);
  });

  it("stores a subscription on checkout.session.completed", async () => {
    const user = await prisma.user.create({ data: { email: "w@b.com" } });
    const event = { id: "evt_1", type: "checkout.session.completed",
      data: { object: { client_reference_id: user.id, customer: "cus_1", subscription: "sub_1" } } };
    const { payload, header } = signed(event);
    const res = await app.inject({ method: "POST", url: "/webhooks/stripe",
      headers: { "stripe-signature": header, "content-type": "application/json" }, payload });
    expect(res.statusCode).toBe(200);
    const sub = await prisma.subscription.findUnique({ where: { userId: user.id } });
    expect(sub.id).toBe("sub_1");
    expect(sub.status).toBe("active");
  });
});
```
> Note: the second test treats `checkout.session.completed` as activating the subscription with status `active`. Real Stripe also sends `customer.subscription.updated` with the precise `current_period_end`; the handler below covers both.

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npx vitest run test/webhook.test.js`
Expected: FAIL — route not found.

- [ ] **Step 3: Implement the webhook (with a raw-body content-type parser)**

`backend/src/routes/stripe-webhook.js`:
```js
import { config } from "../config.js";
import { prisma } from "../db.js";
import { getStripe } from "../billing/stripe.js";

async function upsertSubscription(userId, { id, status, priceId, currentPeriodEnd }) {
  const data = { status, priceId: priceId || null,
    currentPeriodEnd: currentPeriodEnd ? new Date(currentPeriodEnd * 1000) : null };
  await prisma.subscription.upsert({
    where: { id }, // stripe subscription id
    create: { id, userId, ...data },
    update: data,
  });
}

export default async function stripeWebhookRoutes(app) {
  // Stripe needs the raw body for signature verification.
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (req, body, done) => {
    if (req.routeOptions?.url === "/webhooks/stripe") { req.rawBody = body; done(null, undefined); }
    else { try { done(null, JSON.parse(body.toString("utf8"))); } catch (e) { done(e); } }
  });

  app.post("/webhooks/stripe", async (req, reply) => {
    let event;
    try {
      event = getStripe().webhooks.constructEvent(req.rawBody, req.headers["stripe-signature"], config.stripe.webhookSecret);
    } catch {
      return reply.code(400).send({ error: "invalid signature" });
    }
    const obj = event.data.object;
    if (event.type === "checkout.session.completed") {
      const userId = obj.client_reference_id;
      if (userId && obj.subscription) {
        await prisma.user.update({ where: { id: userId }, data: { stripeCustomerId: obj.customer } }).catch(() => {});
        await upsertSubscription(userId, { id: obj.subscription, status: "active", priceId: null, currentPeriodEnd: null });
      }
    } else if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      const user = await prisma.user.findFirst({ where: { stripeCustomerId: obj.customer } });
      if (user) {
        const status = event.type === "customer.subscription.deleted" ? "canceled" : obj.status;
        await upsertSubscription(user.id, {
          id: obj.id, status,
          priceId: obj.items?.data?.[0]?.price?.id,
          currentPeriodEnd: obj.current_period_end,
        });
      }
    }
    return { received: true };
  });
}
```

- [ ] **Step 4: Register in `app.js`**

Add to `backend/src/app.js`:
```js
import stripeWebhookRoutes from "./routes/stripe-webhook.js";
// register BEFORE other routes so its content-type parser is set up:
  app.register(stripeWebhookRoutes);
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd backend && npx vitest run test/webhook.test.js`
Expected: PASS (2 tests).

- [ ] **Step 6: `⚙️ YOU PROVIDE` live webhook test (Stripe CLI)**

```bash
stripe login
stripe listen --forward-to localhost:3000/webhooks/stripe
```
Copy the printed `whsec_...` into `backend/.env` as `STRIPE_WEBHOOK_SECRET`, restart the server, then in another terminal `stripe trigger checkout.session.completed` and confirm a `Subscription` row appears.

- [ ] **Step 7: Commit**

```bash
git add backend/src backend/test/webhook.test.js && git commit -m "feat(backend): stripe webhook with signature verification"
```

---

### Task 7: `requirePremium` guard + a gated sample route

**Files:** Create `backend/src/billing/require-premium.js`, `backend/test/guard.test.js`; Modify `backend/src/app.js`

**Interfaces:** Produces `requirePremium(req, reply)` (Fastify preHandler): 401 if unauthenticated, 402 if `free`, else attaches `req.user`. A sample `GET /premium/ping` demonstrates the gate (real premium routes are wired in Phase 3+).

- [ ] **Step 1: Write the failing test**

`backend/test/guard.test.js`:
```js
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { resetDb } from "./helpers/db.js";

const app = buildApp();
const cookieName = process.env.SESSION_COOKIE_NAME || "my_session";

describe("requirePremium guard", () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  it("allows a trialing (fresh signup) user", async () => {
    const s = await app.inject({ method: "POST", url: "/auth/signup", payload: { email: "g@b.com", password: "supersecret1" } });
    const token = s.cookies.find((c) => c.name === cookieName).value;
    const res = await app.inject({ method: "GET", url: "/premium/ping", cookies: { [cookieName]: token } });
    expect(res.statusCode).toBe(200);
  });
  it("402s a user whose trial has expired and has no subscription", async () => {
    const s = await app.inject({ method: "POST", url: "/auth/signup", payload: { email: "e@b.com", password: "supersecret1" } });
    const token = s.cookies.find((c) => c.name === cookieName).value;
    await prisma.user.update({ where: { email: "e@b.com" }, data: { trialEnd: new Date(Date.now() - 1000) } });
    const res = await app.inject({ method: "GET", url: "/premium/ping", cookies: { [cookieName]: token } });
    expect(res.statusCode).toBe(402);
  });
  it("401s when unauthenticated", async () => {
    const res = await app.inject({ method: "GET", url: "/premium/ping" });
    expect(res.statusCode).toBe(401);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npx vitest run test/guard.test.js`
Expected: FAIL — route/guard not found.

- [ ] **Step 3: Implement the guard**

`backend/src/billing/require-premium.js`:
```js
import { getCurrentUser } from "../auth/current-user.js";
import { entitlementForUser } from "./user-entitlement.js";
import { isPremium } from "./entitlement.js";

export async function requirePremium(req, reply) {
  const user = await getCurrentUser(req);
  if (!user) return reply.code(401).send({ error: "not authenticated" });
  const entitlement = await entitlementForUser(user.id);
  if (!isPremium(entitlement)) return reply.code(402).send({ error: "subscription required", entitlement });
  req.user = user;
}
```

- [ ] **Step 4: Add the sample gated route in `app.js`**

In `backend/src/app.js`, add the import and route:
```js
import { requirePremium } from "./billing/require-premium.js";
// inside buildApp, after route registrations:
  app.get("/premium/ping", { preHandler: requirePremium }, async () => ({ ok: true, premium: true }));
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd backend && npx vitest run test/guard.test.js`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/src backend/test/guard.test.js && git commit -m "feat(backend): requirePremium guard + sample gated route"
```

---

### Task 8: Full suite + phase wrap

- [ ] **Step 1: Run the whole backend suite**

Run: `cd backend && npm test`
Expected: all suites green (Phase 1 + entitlement, trial, checkout, webhook, guard).

- [ ] **Step 2: Confirm the frontend is still untouched**

Run: `cd /Users/faheemafridi/river-intel-pwa && npm run build && npm test`
Expected: `built app.js`, 24/24 tests pass.

- [ ] **Step 3: Tag the phase**

```bash
git commit --allow-empty -m "chore: B phase 2 (stripe + entitlements + paywall) complete"
```

---

## Self-Review

**Spec coverage (Phase 2 slice of B):** Stripe products/prices setup (0), subscription schema + trial/customer fields (1), entitlement resolver (2), 14-day trial + entitlement on `/me` (3), Checkout (4), Customer Portal (5), signature-verified webhook syncing subscription state (6), server-side paywall guard (7), suite (8). Two-sided enforcement: server guard here; UI gating is Phase D.

**Placeholder scan:** no TBD/TODO; every code step is complete. `⚙️ YOU PROVIDE` steps (Stripe price IDs/keys in Task 0; live CLI webhook test in Task 6 Step 6) are real external prerequisites — the coded logic is fully tested without them via the injected mock and Stripe's `generateTestHeaderString`.

**Type/name consistency:** `resolveEntitlement`/`isPremium` signatures match across `entitlement.js`, `user-entitlement.js`, `require-premium.js`. `entitlementForUser(userId)` used consistently in `/auth/me` and the guard. `getStripe()` is the single Stripe accessor mocked in tests and used in `billing.js` + webhook. `Subscription.id` = the Stripe subscription id, upserted by that key in the webhook and read by `userId` elsewhere (both unique). `/billing/checkout` stores `stripeCustomerId`, which `/billing/portal` and the webhook then rely on.

**External-dependency note:** every task's *logic* is verified locally (mock Stripe client + test webhook signatures + live Neon DB). Only real end-to-end Checkout in a browser and a real Stripe-sent webhook need the `⚙️ YOU PROVIDE` Stripe account — mirrors how Phase 1's Google flow needed real credentials for the final live check.
