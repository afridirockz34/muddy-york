# Frontend Auth + Paywall UI — Design (Sub-project D, slice 1)

**Date:** 2026-08-01
**App:** Muddy York Angling Co. (River Intel PWA)
**Depends on:** Production Foundation (B) — auth, Stripe, entitlements, saved spots/alerts endpoints.

## Purpose

Give the PWA the user-facing surface that turns the finished backend into a
product people can sign up for, subscribe to, and manage — accounts, a soft
paywall around premium features, and alert settings — without disrupting the
existing standalone experience.

## Decisions (locked in brainstorming)

- **Auth entry:** a header **account button** opens an **Account modal**.
- **Paywall:** **soft gate** — free users keep a taste; premium features show a
  blurred preview + Upgrade CTA.
- **Settings home:** subscription management + alert prefs live **in the account
  modal**, next to sign-out.
- **Login:** "Continue with Google" prominent + email/password sign in / sign up.

## Architecture

- **Backend-gated activation:** all auth/paywall UI renders only when `API_BASE`
  (`window.MUDDY_API_BASE`) is set. With no backend, the app is unchanged —
  fully open, no auth. This keeps the standalone PWA working.
- **Auth state in `App`:** on mount (if `API_BASE`), `GET /auth/me` (credentials
  included) → `me = { user, entitlement }`. `isPremium = entitlement ∈
  {"active","trialing"}`. A `refreshMe()` re-fetches after auth actions.
- **`proxyJSON`** already sends `credentials:"include"` and supports
  `{method, body}` (added in B phase 5).

## Components (new, in `source-app.jsx`)

1. **`AccountButton`** — header control. Logged out → "Sign in"; logged in →
   initial + entitlement badge ("Trial · N", "Member", "Free"). Opens the modal.
2. **`AuthModal`** — two states:
   - *Signed out:* "Continue with Google" (full-page redirect to
     `${API_BASE}/auth/google`), plus an email/password form with a
     sign-in ⟷ sign-up toggle. Inline validation + friendly error copy.
   - *Signed in:* email, entitlement badge, **Upgrade** (monthly/annual →
     `POST /billing/checkout` → `location = url`) or **Manage subscription**
     (→ `POST /billing/portal` → `location = url`), **AlertPrefs**, **Sign out**
     (`POST /auth/logout` → clear state).
3. **`AlertPrefs`** — email toggle + threshold slider; loads `GET /alert-prefs`,
   saves `PUT /alert-prefs`. Only meaningful for signed-in users.
4. **`Locked`** — reusable soft-gate wrapper: renders children blurred +
   non-interactive with an "🔒 Upgrade" overlay when `!isPremium`; renders
   children normally when premium. One component drives all gating.
5. **Pure helpers** (`lib/entitlement-ui.js`): `entitlementLabel(me)` →
   display string; `planPrice(plan)` → label. Unit-tested.

## What the soft gate covers

Free / trial-expired users keep: **today's top pick**, the **nearest 2–3
curated waters**, and **basic conditions**. Wrapped in `Locked` (blur + CTA):

- the **full ranked list** beyond the free taste,
- **discovery results** ("find water near me"),
- the **fly advisor** (Strategy & flies),
- **parking / driving / hiking routes**.

`isPremium` users see everything normally.

## Required backend adjustment

Session cookie must be cross-site-capable in production (PWA on Netlify ↔ API on
Render): set `sameSite: config.isProd ? "none" : "lax"` and `secure:
config.isProd` wherever the session cookie is set (auth + google routes). Local
dev stays `lax` (localhost:8000 ↔ :3000 is same-site). Without this, production
login silently fails. CORS already allows credentials from the frontend origin.

## Data flow

1. Load → `refreshMe()` (if `API_BASE`).
2. Sign up / sign in → POST → `refreshMe()` → modal reflects signed-in state.
3. Google → full-page redirect → backend sets cookie → redirect to frontend →
   `refreshMe()` on next load shows signed-in.
4. Sign out → POST `/auth/logout` → clear `me`.
5. Upgrade / Manage → POST → `window.location = returnedUrl` (Stripe).
6. Alert prefs → GET on modal open, PUT on change.

## Error handling

- Bad credentials → inline "Email or password incorrect." Duplicate signup →
  "That email is already registered." Network failure → inline "Couldn't reach
  the server — try again."
- No `API_BASE` → no auth UI at all; app fully open.
- Entitlement/`/auth/me` failure → treat as signed-out/free; never blank-screen.

## Testing

- **Unit:** `lib/entitlement-ui.js` helpers (label + price) via Vitest.
- **Browser (live against the running backend):** sign up → "Trial" badge; a
  gated section (advisor) shows the lock when free and unlocks when premium;
  Upgrade button redirects toward Stripe checkout; sign out returns to
  signed-out state. Verified with `window.MUDDY_API_BASE` pointed at
  `http://localhost:3000`.

## Out of scope (YAGNI)

- Password reset (no backend endpoint yet — a later addition).
- Email-verification gating at signup.
- Catch-log cloud sync UI (backend defers it too).

## Success criteria

- With a backend configured, a user can sign up (email or Google), see a trial
  badge, hit the paywall on premium features, start a Stripe checkout, manage
  their subscription, set alert prefs, and sign out — all from the header
  account button.
- With no backend configured, the app behaves exactly as before.
