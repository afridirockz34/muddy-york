# Product & Monetization Strategy — Design (Sub-project A)

**Date:** 2026-08-01
**App:** Muddy York Angling Co. (River Intel PWA)
**Scope:** Strategy definition only (non-code). Feeds sub-projects B–E.

## Purpose

Turn the app from a free, self-contained on-device PWA into a production-ready,
subscription product people will pay for — fly-forward, while still serving
conventional ("normal") anglers on the core value.

This document is the **strategy** that constrains the build sub-projects. It
deliberately makes no implementation decisions beyond what strategy requires.

## The larger program (decomposition)

"Production-ready subscription app" is five sub-projects, each with its own
spec → plan → build cycle:

- **A — Product & monetization definition** (this doc)
- **B — Production foundation:** backend, accounts/auth, cloud sync, reliable
  data pipeline replacing the flaky free public APIs
- **C — Payments & subscriptions:** Stripe, entitlements, paywall (largely
  folds into B)
- **D — Premium features:** forecasts, offline maps, catch-log sync, measured
  conditions, the fly advisor with visual references
- **E — Publish & go-to-market:** landing page, onboarding, analytics, support,
  legal

**Order: A → B (incl. C) → D → E.** Nail the value prop and platform before
building infrastructure.

## Decisions (locked in brainstorming)

- **Hero value:** the where/when intelligence — "it tells me where to go this
  morning." Ranked best water anywhere, scored by live conditions + season,
  plus discovery. This is the moat.
- **Platform:** Web PWA + Stripe. Keep the installable PWA; add subscriptions.
  ~97% revenue retention, instant updates, no app-store gatekeeping. Native is
  a later option, out of scope now.
- **Model:** Freemium + free trial.
- **Pricing:** $9.99/mo or $59.99/yr (annual highlighted, ~50% off). Optional
  launch "Founding Member" annual discount to seed reviews and early cash.
- **Positioning:** Fly-forward brand and identity. Conventional anglers are
  first-class for the hero value (their species — smallmouth bass, pike,
  walleye, panfish — are already scored). Tactical coaching stays **fly-only at
  launch**; spin/bait tactics are an explicit roadmap item, not a v1 promise.

## Positioning & audience

Tagline direction: *"Find the right water — read by season, weather, and
water."* Fly anglers are the core buyer (they invest in quality tools and speak
the advisor's language). Normal anglers get the same where/when intelligence for
their species; they are welcomed, not centered. Keeping tactical depth fly-only
at launch preserves a sharp identity instead of half-serving two personas.

## Value proposition & the free/paid line

Give a taste free; gate the depth.

**Free forever (the hook):**
- Today's single top pick near you
- Your nearest 2–3 curated waters
- Basic current conditions for those
- A limited map

**Paid (the depth):**
- Full ranked list of all water anywhere in range
- Dynamic discovery + "widen search" everywhere
- The fly advisor: techniques, fly box, species strategy, **with a visual
  reference on every fly/bait** (see below)
- Parking + driving + hiking routes + Google Maps hand-off + offline maps
- Catch logbook synced across devices
- Condition alerts

**Trial:** 14-day full access on signup, **no card required**. After it ends
the user falls back to the free tier (not locked out) — maximizes top-of-funnel
and word of mouth.

## Fly/bait visual reference (feature requirement for D)

Many anglers cannot picture a pattern from its name (e.g. "Elk Hair Caddis",
"San Juan Worm"), so a recommendation they can't visualize is one they won't
act on. Requirement:

- **Now (universal, zero-licensing):** a "See it" link on each recommended
  fly/bait that opens a Google Images search for the exact pattern name (e.g.
  `Elk Hair Caddis fly`). Same deep-link approach as the Google Maps buttons;
  covers 100% of patterns from day one with no image-hosting or copyright
  exposure.
- **Fast-follow (premium polish):** a curated thumbnail library for the ~30–40
  common patterns the advisor recommends, shown inline, with the Google link as
  the fallback for anything not yet in the library.

Rationale for the combined approach: bundling fly photos requires sourcing and
licensing each image; the Google link sidesteps that entirely and works
immediately for every pattern. Thumbnails are added later where licensing is
clear.

## Pricing & packaging

- Monthly: **$9.99**
- Annual: **$59.99** (highlighted best value; captures the seasonal buyer up
  front)
- Optional launch lever: limited **Founding Member** annual discount

## Platform & tech implications (constraints for B/C/E)

Web PWA + Stripe makes the currently-nonexistent backend real, doing triple
duty:
- **Accounts:** email + Google sign-in; **entitlements** (who is paid)
- **Stripe:** subscriptions, webhooks, the paywall gate
- **Data proxy:** server-side Overpass/OSRM with caching (fixes the 429
  reliability problem observed in testing) and the seam for real streamflow
  gauge data

This is why B is the first build after A.

## Non-negotiables before charging

- **Data trustworthy enough to sell:** reliable proxy at minimum; measured
  flow/temp where gauges exist is a strong fast-follow that upgrades the hero
  value from good to trustworthy.
- **Legal footing:** Terms of Service, Privacy Policy, auto-renew/subscription
  disclosure, refund policy, and clear disclaimers (not a substitute for
  official regulations; fish-welfare + safety guidance).

## Success metrics

- **Activation:** % of new users who run "find water near me" and open a spot in
  their first session
- **Trial → paid** conversion
- **In-season weekly retention**
- **Annual renewal rate**
- **MRR** and early revenue milestones

## Launch MVP (smallest thing worth paying for)

Accounts + Stripe + entitlement-gating of the intelligence already built (full
ranked list, discovery, fly advisor, routes gated; taste free) + reliable data
proxy + fly/bait "See it" links + legal pages + a landing page. Forecasts,
offline maps, catch-log sync, and measured gauge data are fast-follows in D.

## Out of scope (for this program's first pass)

- Native iOS/Android store apps and in-app purchase
- Spin/bait tactical coaching (roadmap, post-launch)
- Community/social reports
- Curated fly thumbnail library at launch (fast-follow; Google links first)

## Success criteria for this sub-project

A is complete when B–E can be specced against it without further strategic
questions: the value prop, free/paid boundary, price, platform, positioning,
trial mechanics, legal requirements, and launch-MVP scope are all fixed.
