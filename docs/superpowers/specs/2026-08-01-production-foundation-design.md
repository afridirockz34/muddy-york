# Production Foundation — Design (Sub-project B)

**Date:** 2026-08-01
**App:** Muddy York Angling Co. (River Intel PWA)
**Depends on:** [Product & Monetization Strategy (A)](2026-08-01-product-monetization-strategy-design.md)
**Feeds:** D (premium features), E (publish/GTM)

## Purpose

Build the backend and client changes that let the app charge money and be
trustworthy: accounts, Stripe subscriptions with entitlement-gated features, a
reliable data pipeline replacing the flaky public APIs, measured stream
conditions, and email condition-alerts. This is the first real build toward
launch.

## Decisions (locked in brainstorming)

- **Backend:** custom **Node + Fastify** on **Render**, managed **Postgres**,
  **Prisma** ORM. Frontend PWA stays on Netlify and calls the backend API.
- **Auth:** self-hosted library (**Lucia** or **Auth.js**) in the backend.
  Email sign-in + **Google OAuth**. Secure `httpOnly` session cookies, CSRF
  protection. Transactional email via **Resend** or **Postmark**.
- **Payments:** **Stripe** ($9.99/mo, $59.99/yr). Checkout for signup, Customer
  Portal for management, webhooks → Postgres. 14-day no-card trial as an
  entitlement flag with expiry.
- **Paywall enforced on both sides:** UI hides premium features by entitlement;
  premium API endpoints re-check entitlement server-side.
- **Reliable data proxy:** backend proxies Overpass + OSRM with caching,
  fallback endpoints, rate-limit handling. PWA calls the proxy, not public APIs.
- **Measured conditions:** integrate **Water Survey of Canada** real-time
  hydrometric data (streamflow; water temp where gauged). Scoring stays
  client-side but consumes measured flow/temp when a nearby gauge exists,
  labeled "measured" vs "modeled".
- **Condition alerts:** backend stores saved waters + alert prefs; a scheduled
  Render job emails users when a saved water hits "prime". Push notifications
  deferred (email first).
- **Saved-spots move server-side** (required by alerts) — a subset of full
  sync. Cross-device saved spots is a bonus. **Full catch-log sync deferred to
  D.**

## Architecture

```
[ PWA on Netlify ] --HTTPS/JSON--> [ Fastify API on Render ] --> [ Postgres (Render) ]
       |                                   |  |  |
       |                                   |  |  +-- Stripe (subscriptions, webhooks)
       |                                   |  +----- Overpass / OSRM (proxied + cached)
       |                                   +-------- Water Survey of Canada (measured)
       +-- Google OAuth (via backend)      +-------- Resend/Postmark (email)
                                           +-------- Scheduler (alerts job)
```

- **Frontend gains an API layer:** auth/session state, a fetch wrapper that
  sends credentials and handles 401/entitlement errors, and an **entitlement
  context** that gates premium UI. Discovery/routing/conditions calls are
  repointed from public APIs to the backend proxy.
- **Backend is the trust boundary:** it holds secrets, enforces entitlements,
  caches third-party data, and runs scheduled work.

## Components

### 1. Backend skeleton
- Fastify app, Prisma + Postgres, config via Render env vars, health check,
  structured logging, CORS locked to the Netlify origin, global rate limiting.

### 2. Auth (Lucia/Auth.js)
- Email sign-in (verification email) + Google OAuth.
- Sessions in `httpOnly`, `Secure`, `SameSite` cookies; CSRF protection on
  state-changing routes.
- `GET /me` returns the user + entitlement summary for the client.

### 3. Payments & entitlements
- Stripe products/prices for monthly + annual.
- `POST /billing/checkout` → Stripe Checkout session; `POST /billing/portal` →
  Customer Portal.
- `POST /webhooks/stripe` (signature-verified) updates `subscriptions`.
- Entitlement resolver: `active | trialing | free` from subscription status +
  `trial_end`. Premium API routes call it; unauthorized → 402/403.

### 4. Reliable data proxy
- `GET /discover`, `GET /route`, `GET /parking` proxy Overpass/OSRM with:
  server-side cache (table or Redis) keyed by rounded coords + TTL, ordered
  fallback endpoints, retry/backoff, and normalized responses.
- The existing client `lib/discovery.js` / routing calls repoint to these.

### 5. Measured conditions
- `GET /conditions?lat=&lon=` returns measured streamflow/water-temp from the
  nearest Water Survey of Canada gauge (with distance + freshness), or an empty
  measured block when none is near.
- Client merges measured values into `condFor`/`modelStreamTemp`, prefers
  measured when present, labels the source.

### 6. Saved spots + alerts
- `GET/POST/DELETE /saved-spots` store the user's waters server-side; first
  login migrates on-device saved spots up.
- `GET/PUT /alert-prefs` (channels=email, thresholds, quiet hours).
- Scheduled job (Render cron): for each user with alerts on, evaluate their
  saved waters' current opportunity; email when one crosses "prime" (with
  de-dup so it doesn't re-alert every run).

## Data model (Postgres)

- `users` (id, email, email_verified, google_id, created_at)
- `sessions` (id, user_id, expires_at)
- `subscriptions` (user_id, stripe_customer_id, stripe_sub_id, status, plan,
  current_period_end, trial_end)
- `saved_spots` (id, user_id, ref, lat, lon, label, source, created_at)
- `alert_prefs` (user_id, email_enabled, prime_threshold, quiet_hours,
  last_alert_at per spot)
- `proxy_cache` (key, payload, expires_at) — or Redis
- *(catch-log tables deferred to D)*

## Error handling & offline

- Any third-party failure (Overpass/OSRM/WSC) degrades: serve cached data, then
  a clear error; never blank-screen. Mirrors current client behavior.
- Client keeps last-known conditions for offline, as today.
- Auth/entitlement failures surface friendly states (signed-out, trial expired
  → soft paywall, not a crash).

## Security

- Secrets (Stripe, WSC, Google OAuth, email, DB URL) in Render env vars, never
  in the client bundle.
- `httpOnly`/`Secure`/`SameSite` cookies; CSRF tokens on mutations; CORS locked
  to the Netlify origin; rate limiting; Stripe webhook signature verification;
  server-side entitlement checks on every premium route.

## Cost (ongoing, rough)

- Render web service + managed Postgres, transactional email (free tiers to
  start), Stripe per-transaction fees. Scales with usage; free/low tiers cover
  launch.

## Scope boundary

**In B v1:** backend skeleton, auth, Stripe + entitlements + paywall, reliable
data proxy, measured conditions, email condition-alerts, server-side saved
spots + prefs, one-time saved-spots migration.

**Deferred (to D or later):** full catch-log cloud sync, push notifications
(email first), forecasts, offline maps, spin/bait tactics, native apps.

## Implementation phasing (for the plan)

Each phase is independently shippable:

1. Backend skeleton + auth (accounts working end-to-end)
2. Stripe + entitlements + paywall gate
3. Reliable data proxy (repoint client)
4. Measured conditions (WSC)
5. Saved-spots server-side + email alerts

## Success criteria

- A user can sign up (email or Google), start a 14-day trial, subscribe via
  Stripe, and manage/cancel via the portal.
- Premium features are gated in the UI and enforced server-side.
- Discovery/routing run through the cached proxy with no user-visible 429s.
- Conditions show measured flow/temp near gauges, modeled elsewhere, clearly
  labeled.
- A user with alerts on and a saved water gets an email when it hits prime,
  without duplicate spam.
- Saved spots persist across devices; existing on-device spots migrate on first
  login.
