# Checkout Redesign — In-App Card-Required Trial + Apple Pay — Design

**Date:** 2026-08-11
**App:** Muddy York Angling Co.
**Scope:** Backend billing changes + entitlement + webhook + frontend full-screen embedded checkout + onboarding flow.
**Depends on:** B-phase-1/2 (auth, Stripe, entitlements, webhook), frontend auth/paywall UI.

## Purpose

Replace the no-card trial with a **professional card-required 14-day trial**: after
signup (or upgrade), a **full-screen in-app checkout** collects card / Apple Pay /
Google Pay, the trial starts with the card on file, and billing begins at day 14
unless cancelled. This is the "solid checkout process" — PCI-safe, in-app, standard
for paid apps.

## Decisions (locked in brainstorming)

- **Card-required trial** — no more no-card trial. Signup no longer auto-grants a
  trial; the trial starts only by completing checkout with a payment method.
- **Stripe Embedded Checkout** — Stripe's checkout UI rendered *inside* a full-screen
  modal in our app (not a redirect away). Apple Pay / Google Pay appear automatically
  once enabled in the Stripe dashboard.
- **Onboarding:** post-signup the checkout opens automatically as the primary step,
  with a subtle "Maybe later — continue on the free plan" escape (free taste; can
  start the trial anytime from Account).
- Copy: **"You won't be charged today. Billing starts after your 14-day free trial
  on [date] — cancel anytime before then."**

## `⚙️ YOU PROVIDE` (Stripe dashboard, one-time)

- Enable **Apple Pay** and **Google Pay** in Settings → Payments → Payment methods,
  and **verify the domain** `muddy-york.netlify.app` for Apple Pay.
- The **publishable key** `pk_test_…` (public; used by the frontend).

## Backend

### 1. Checkout session (embedded, trial)
`POST /billing/checkout` (auth) → creates a **subscription** Checkout Session with:
`ui_mode: "embedded"`, `mode: "subscription"`, `customer` (ensure customer),
`line_items:[{price, quantity:1}]`, `subscription_data:{ trial_period_days: 14 }`,
`client_reference_id: userId`, `return_url: FRONTEND_ORIGIN + "/?checkout=complete"`.
Returns `{ clientSecret }` (not a URL).

### 2. Publishable key
`GET /billing/config` (public) → `{ publishableKey }` from `STRIPE_PUBLISHABLE_KEY`.
Frontend fetches it before mounting checkout (avoids hardcoding per environment).

### 3. Webhook (handle the trial subscription)
Add `customer.subscription.created` alongside `updated`/`deleted`, using the real
`obj.status` (`trialing`/`active`/…) and `obj.current_period_end`. On
`checkout.session.completed`: set `user.stripeCustomerId = obj.customer` and upsert
the subscription `{ id: obj.subscription, status: "trialing", currentPeriodEnd: null }`
(our checkout always creates a trial; subscription events then fill/correct it). This
avoids the create-vs-complete event race.

### 4. Entitlement resolver
Treat a Stripe **`trialing`** subscription as premium:
- `status === "active" && currentPeriodEnd > now` → `"active"`
- `status === "trialing"` → `"trialing"` (card-on-file Stripe trial; premium)
- else legacy `trialEnd > now` → `"trialing"` (backward compat; null for new users)
- else `"free"`

### 5. Remove the no-card trial
Signup and Google callback **no longer set `trialEnd`**. Existing users' `trialEnd`
still honored (backward compat).

## Frontend

### CheckoutModal (full-screen, embedded)
- Loads `https://js.stripe.com/v3/` dynamically on open.
- `GET /billing/config` → publishable key → `Stripe(pk)`.
- `stripe.initEmbeddedCheckout({ fetchClientSecret })` where `fetchClientSecret`
  calls `POST /billing/checkout {plan}` → `clientSecret`; mounts into a full-screen
  container. On completion Stripe redirects to `return_url`
  (`/?checkout=complete`) → app reloads → `refreshMe` shows `trialing`.
- Header copy + the "no charge today, billing starts [date]" line + plan toggle
  (annual default, monthly). A close/"Maybe later" control.

### Onboarding
- After a successful **signup** (email or, on return, Google), auto-open the
  CheckoutModal. "Maybe later — continue on the free plan" closes it (user stays
  free; can open it again from Account → Start trial).
- The **Account panel** "Go annual/Monthly" buttons open the same CheckoutModal
  (embedded) instead of redirecting.
- `?checkout=complete` on load → close any modal, `refreshMe`, show a brief
  "Trial started — welcome" note.

## Data flow

signup → CheckoutModal opens → `/billing/config` + `/billing/checkout` →
embedded Stripe UI (card/Apple Pay) → complete → `return_url` → reload →
`/auth/me` = `trialing` (premium) → webhook keeps status in sync → day 14 Stripe
charges (or user cancels via portal → `canceled` → `free`).

## Error handling

- Not signed in → `/billing/checkout` 401; modal prompts sign-in.
- Stripe.js load fails / no publishable key → friendly "checkout unavailable, try
  again" in the modal; app still usable on free tier.
- Webhook missing `stripeCustomerId` (race) → checkout.session.completed sets it;
  subscription events retried by Stripe.
- No `API_BASE` (standalone) → no checkout UI.

## Testing

- **Unit (Vitest):** `resolveEntitlement` returns `"trialing"` for a Stripe
  `trialing` sub (premium) and `"free"` when no sub and no legacy trial.
- **Backend (TEST_DATABASE_URL):** `/billing/checkout` returns a `clientSecret`
  (Stripe mocked); `/billing/config` returns the key; webhook `subscription.created`
  with `trialing` sets status; signup no longer sets `trialEnd`.
- **Browser (live, test mode):** signup → full-screen checkout opens → test card
  `4242…` (and Apple Pay if on a supported device) → completes → app shows premium
  (Trial), account shows the card-on-file trial; "Maybe later" keeps free tier.

## Out of scope

- Proration/plan-switch UI beyond monthly⟷annual at checkout (portal handles
  changes).
- Dunning/failed-payment emails (Stripe handles; custom emails later).

## Success criteria

- New users hit a full-screen in-app checkout collecting card/Apple Pay before the
  trial starts; copy states billing begins after 14 days unless cancelled.
- A Stripe `trialing` subscription unlocks premium; at day 14 it converts to
  `active` (charged) or `canceled` (free) automatically.
- No path grants a trial without a payment method (legacy trials still honored).
