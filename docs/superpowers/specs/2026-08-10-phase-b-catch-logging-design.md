# Phase B — Free Catch Logging → Opportunity Nudge — Design

**Date:** 2026-08-10
**App:** Muddy York Angling Co.
**Scope:** Backend (catches + aggregate) + frontend logging UI + a bounded opportunity nudge.
**Depends on:** B-phase-1 auth (accounts + `getCurrentUser`), Phase-3 proxy (cache), the scoring engine.

## Purpose

Let any signed-in angler log what they caught (species + approx size), **free for
all tiers**, tied to a **reach only (never GPS)**. Aggregated, anonymized catch
activity gently nudges a reach's opportunity/confidence so water that is actually
producing fish lately ranks a touch higher and reads as more confident. This is
the community data flywheel — kept honest and bounded.

## Decisions (locked in brainstorming)

- **Privacy:** a catch attaches to a **reach** (river + section + ref), never
  coordinates. Aggregates expose **counts only** — never names, never locations.
- **Who can log:** **any signed-in user, free** (not gated by subscription).
  Tied to the account for quality/anti-spam. Signed-out → prompt to sign in.
- **Feedback:** a **bounded opportunity nudge** only. No public catch summary and
  no change to the fish-estimate text (both deferred, easy to switch on later).
- Distinct from the **private notes journal** (which keeps exact GPS pins and
  stays local/private) — a catch report is a shared, anonymized data point.

## Data model

`Catch` (Postgres via Prisma):
`id · userId · ref · river · section · species · sizeInches (float?) · technique? ·
flies? · caughtAt (default now) · createdAt`.
- `ref` is the reach id (curated `sec.id` or discovered `auto-<osmid>`).
- **No latitude/longitude columns.** Location is the reach label only.
- Indexed by `ref` (for aggregation) and `userId` (for the angler's own log).

## Backend

- `POST /catches` — **auth required (any tier)**. Body: `{ ref, river, section,
  species, sizeInches?, technique?, flies? }`. Validates `ref` + `species`;
  clamps `sizeInches` to a sane range. Returns the created catch.
- `GET /catches` — the caller's own catches, newest first.
- `DELETE /catches/:id` — delete one of the caller's own catches.
- `GET /api/catch-activity` — **public, cached (~10 min)**, anonymized: returns
  `{ activity: { [ref]: { count30d, lastDays, momentum } } }` where `momentum`
  is a small decayed score in `0..1` (recent + frequent → higher). Counts only;
  no user identifiers, no coordinates.

## Feedback loop (the nudge)

- Pure helper `catchNudge(momentum) => 0..6` (bounded points), decaying over ~30
  days (already reflected in `momentum`).
- The frontend fetches `/api/catch-activity` once, and when scoring a reach adds
  `catchNudge(activity[ref]?.momentum)` to the **opportunity** score (clamped to
  100) and a small amount to **confidence**. The base scoring engine is unchanged;
  the nudge is a thin post-step so it can never dominate.

## Frontend

- **`CatchButton`/`CatchForm`** on the spot card (Rivers list `RecCard`) and the
  map sheet: signed-in → opens a small form (species chooser from the existing
  `SPECIES` set + a size input, optional technique/flies); signed-out → "Sign in
  to log a catch — it's free."
- On submit → `POST /catches` → quiet confirmation ("Logged — thanks, it helps
  everyone"). No public summary rendered (per decision).
- Opportunity nudge applied in the `ranked` computation using the fetched
  activity map.
- Standalone (no `API_BASE`) → catch logging hidden; the private notes composer
  still captures species/size locally.

## Data flow

1. On load (if `API_BASE`): fetch `/api/catch-activity` → `activityMap`.
2. `ranked` = engine score + `catchNudge(activityMap[ref]?.momentum)`.
3. Log a catch → `POST /catches` → (optionally) refetch activity so the nudge
   reflects it.

## Error handling

- Not signed in → 401 on `POST /catches`; UI shows the sign-in prompt (never a
  crash).
- Activity fetch fails → empty map → no nudge (scores unchanged).
- Invalid input → 400 with a friendly message.
- All aggregates degrade to counts-only; a missing reach simply has no nudge.

## Testing

- **Pure (Vitest):** `catchNudge` bounds/decay; the aggregate momentum
  computation (recent+frequent → higher, old → ~0).
- **Backend (real DB via `TEST_DATABASE_URL`):** `POST /catches` requires auth;
  stores reach-level only; `GET /catches` returns own; `DELETE` scopes to owner;
  `/api/catch-activity` returns anonymized counts and never leaks user ids or
  coordinates.
- **Browser:** signed-in log-a-catch flow submits and confirms; signed-out shows
  the prompt; a reach with recent catches shows a slightly higher opportunity.

## Out of scope (later phases)

- Photos, comments, likes (Phase C).
- Public catch summaries and fish-estimate sharpening from catches (deferred; the
  data is being collected now so these can switch on later).
- Notes cloud-sync (Phase D).

## Success criteria

- Any signed-in angler (free tier included) can log a catch tied to a reach in a
  couple of taps; nothing stores or shows their exact location.
- Recent catch activity gives a reach a small, bounded opportunity/confidence
  nudge that decays over ~30 days and never dominates the score.
- The aggregate endpoint exposes counts only — verified no user ids or
  coordinates in its response.
