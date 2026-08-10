# Phase A — Frontend Redesign & Navigation — Design

**Date:** 2026-08-08
**App:** Muddy York Angling Co.
**Scope:** Frontend only. No backend changes, no new APIs.
**Feeds:** D (notes/GPS), B (catch logging), C (social feed), E (rivers + bathymetry).

## Purpose

Make the app feel worth paying for: simpler navigation, legible typography,
aligned layout, a distinctive brand, and a fixed map→route interaction. Phase A
also builds the shells (Notes, News) that later phases fill with backend data.

## Decisions (locked in brainstorming + mockup review)

- **Navigation:** bottom tab bar (3 tabs) + top bar with crest and hamburger →
  side drawer.
- **Aesthetic:** heritage-modern hybrid. Display serif for river names and
  headings; system sans for all content. Green/brass identity kept, deepened.
- **Logo:** realistic line-art trout crest, drawn from salmonid anatomy
  (adipose fin, full fin set, gill plate, lateral line, haloed spots).
  **Swappable** — the user may supply a different image later, so the crest
  lives in ONE component/file and is replaced in one place.
- **No emojis anywhere.** A custom 24px-grid icon set (1.9px stroke, rounded
  joins) replaces every emoji in the app.
- **Meta strip:** one compact, non-sticky row (date/time, now, season, radius)
  that scrolls away. Only the List/Map toggle is pinned.

## Information architecture (the big change)

**Before:** Map · Report · Rivers · News · Saved · Notes (6 top tabs)
**After:** **Rivers · News · Notes** (3 bottom tabs) + drawer

| Old | New home |
|---|---|
| Report | **Rivers** (List view) — renamed |
| Map | **Rivers** (Map view) via a List⟷Map toggle |
| Rivers (database) | removed — Rivers list already covers it |
| Saved | removed — saved water lives in **Notes** |
| News | **News** (redesigned as social-style feed) |
| Notes (method/about) | **Notes** (personal) + method moved to drawer |

## Components

### 1. Brand (`lib/brand.jsx` — new)
- `<Crest size/>` — the trout crest, single source of truth (swap here later).
- `<Icon name size/>` — the icon set: `rivers, news, notes, fly, drive, walk,
  pin, save, alert, radius, account, method, map, list, search, like, check,
  menu, plus, close`. No emoji anywhere in the app after this.

### 2. Shell (`source-app.jsx`)
- **TopBar:** crest + "Muddy York / Angling Co." + hamburger.
- **Drawer:** crest lockup, links (Rivers, News, Notes), then Account,
  Condition alerts, Search radius, Method & sources, and the before-you-fish
  note. Closes on overlay tap/Esc.
- **TabBar:** fixed bottom, 3 tabs with icons + labels, brass active state,
  `env(safe-area-inset-bottom)` padding.
- **MetaStrip:** compact row — date/time · now · season · **radius (tappable)**.
  Scrolls with content.

### 3. Rivers tab
- **List/Map segmented toggle** (pinned).
- **List:** redesigned `RecCard` — rank, river name (21px serif), section +
  distance, source badge, score ring + "Prime/Fair/Slow", species pills, plain
  explanation, a 3-up conditions grid, and actions (Strategy & flies, Route).
  Paywall gating behaviour is preserved exactly as today.
- **Map:** existing Leaflet map, unchanged behaviour.
- **RadiusControl:** sheet with presets (30 / 60 / 120 / 150 km) writing the
  existing `radiusM` state; replaces the "Widen search" button.

### 4. Map → route interaction (the fix)
Today: selecting a spot opens a card; tapping Route keeps the card open and
crams the route above it.

New: one **bottom sheet** with a fixed vertical order —
1. **Title** (river + section + distance)
2. **Basic info** (species pills, water/flow chips, score ring)
3. **Route steps** — Drive (time/distance → parking), then Walk the trail
   (time/distance → access), each with an icon
4. **Actions** — Open in Google Maps · Close

Tapping **Route** transitions the same sheet to this state (no second panel, no
stacked card). Parking/route content stays paywalled as today.

### 5. Notes tab (local-first, private)
Replaces both the old Saved tab and the old method/about Notes tab.
- **Saved water** list (from existing local `saved` state) with a Log/Note action.
- **Personal notes**: free-text title + body, technique, flies/patterns used,
  optional species + approx size, date. Stored in IndexedDB (existing `dbGet`/
  `dbSet`), **private to the angler**.
- **Drop a pin here** — uses `navigator.geolocation` to attach the angler's
  current GPS coordinates to a note, with a "Open in Google Maps" link to
  return to that exact spot later.
- A small **Overall score** box and the **Before you fish** regulations warning
  live at the bottom of this tab (moved out of the old Notes tab).

*(Backend sync for notes/catches is Phase B/D — Phase A stores locally.)*

### 6. News tab (social-style presentation)
- Existing derived items (weather/water/window alerts) + any external feed are
  re-skinned as **social-style post cards**: avatar/source mark, title, body,
  category chip, timestamp, and a like/comment action row.
- **Locations are never shown** on catch-style posts (a rule the later backend
  must also enforce).
- Compose UI and real posting/likes/comments are **Phase C** — Phase A ships the
  card design and a disabled-with-explanation compose affordance.

### 7. Copy cleanup
- "Reading live weather, river by river." appears **only** on the Rivers tab
  (the home view) — removed from all other tabs.

## Typography & palette

- **Serif** (`Playfair Display`, Georgia fallback): river names, headings.
- **Sans** (system stack): all body, labels, controls.
- Minimum body **14px** (was ~12), labels **9.5–10px** (was 7–9), river names
  **21px**, section text **13.5px**.
- Palette: pine `#2C4C3B`, pine-deep `#1B3325`, brass `#D4AF37`, bone `#F7F3EA`,
  panel `#FFFDF8`, ink `#20241F`, dim `#6E6858`, brick `#8B3A3A`.
- Score colour keeps its text companion ("Prime/Fair/Slow") for colourblind
  safety.

## Data flow

No API changes. Existing state (`ranked`, `discovered`, `saved`, `radiusM`,
`me`/entitlement, weather) is re-presented. New local state: `drawerOpen`,
`riversView` (`list|map`), `sheetMode` (`info|route`), `notes[]` (IndexedDB).

## Error handling

- Geolocation denied/unavailable in Notes → inline message, note still saves
  without a pin.
- No backend (`API_BASE` unset) → app fully open, no account UI, as today.
- Offline → existing cached behaviour unchanged.
- All paywall gating (`Locked`, `isPremium`) preserved exactly.

## Testing

- **Unit (Vitest):** icon-name registry completeness, notes model helpers
  (create/serialize/pin), radius preset mapping.
- **Browser:** all three tabs render; drawer opens/closes; List⟷Map toggle;
  route sheet ordering (title → info → route); note with GPS pin saves and
  reloads; no emoji remains in rendered output; existing 27 frontend tests pass.

## Out of scope (later phases)

Backend catch logging (B), real social posting/likes/comments and image
uploads (C), notes cloud sync (D), new rivers + bathymetry-driven fish
intelligence (E).

## Success criteria

- Three tabs only; Saved and the old Rivers tab are gone; Map lives inside
  Rivers.
- Tapping Route reflows the sheet to title → basics → route, with the card no
  longer left open above it.
- Radius is adjustable from the meta strip and the drawer.
- No emoji in the UI; all icons come from `<Icon/>`.
- Notes tab stores private notes with an optional GPS pin, offline.
- Body text is never smaller than 14px; the meta row scrolls away.
- Crest can be swapped by editing one file.
