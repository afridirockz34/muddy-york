# Phase A — Frontend Redesign & Navigation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Rebuild the app's navigation (3 tabs + drawer), brand (swappable crest + custom icon set, zero emojis), typography, the map→route interaction, and add a local-first Notes tab and social-style News cards.

**Architecture:** New focused `lib/brand.jsx` (Crest + Icon) and `lib/notes-model.js` (pure). `source-app.jsx` is reworked in place: tab state collapses from 6 to 3, a drawer + compact meta strip are added, Map folds into Rivers, the route panel becomes one reflowing sheet. All existing engine/scoring/paywall code is reused untouched.

**Tech Stack:** React (esbuild bundle), Vitest, existing IndexedDB helpers.

## Global Constraints

- **No emojis** in rendered UI — every glyph comes from `<Icon name=…/>`.
- **Crest is swappable in one file** (`lib/brand.jsx`).
- Minimum body text **14px**; river names **21px** serif; labels ≥ **9.5px**.
- Palette: pine `#2C4C3B`, pine-deep `#1B3325`, brass `#D4AF37`, bone `#F7F3EA`, panel `#FFFDF8`, ink `#20241F`, dim `#6E6858`, brick `#8B3A3A`.
- **All paywall gating (`Locked`, `isPremium`) preserved exactly.**
- Standalone mode (no `API_BASE`) still works; no backend calls added.
- "Reading live weather, river by river." appears only on the Rivers tab.

---

### Task 1: Brand module — Crest + Icon (swappable, no emojis)

**Files:** Create `lib/brand.jsx`, `lib/brand.test.js`

**Interfaces:**
- Produces `Crest({ size = 40, variant = "dark" })` → the trout crest SVG (single source of truth; swap here later).
- Produces `Icon({ name, size = 22, stroke = 1.9 })` → line icon from a registry.
- Produces `ICON_NAMES` (array) used by tests and callers: `rivers,news,notes,fly,drive,walk,pin,save,alert,radius,account,method,map,list,search,like,check,menu,plus,close,refresh,widen`.

- [ ] **Step 1: Failing test** `lib/brand.test.js`:
```js
import { describe, it, expect } from "vitest";
import { ICON_NAMES, iconPath } from "./brand.jsx";
describe("icon registry", () => {
  it("every declared name has a path", () => {
    for (const n of ICON_NAMES) expect(typeof iconPath(n)).toBe("string");
  });
  it("unknown name returns empty", () => { expect(iconPath("nope")).toBe(""); });
});
```

- [ ] **Step 2:** Run `cd /Users/faheemafridi/river-intel-pwa && npx vitest run lib/brand.test.js` → FAIL.

- [ ] **Step 3: Implement** `lib/brand.jsx`. Export `ICON_NAMES`, `iconPath(name)` (returns the inner SVG markup string for that name, "" if unknown), `Icon`, and `Crest`. Each icon is inner `<path>`/`<circle>` markup on a 24 viewBox. `Icon` renders `<svg width=size height=size viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth=stroke strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{__html: iconPath(name)}}/>`. `Crest` renders the realistic trout SVG from the approved mockup (viewBox 0 0 200 200), honoring `variant` (`dark` = filled crest, `mono` = single-colour). Keep the full crest markup in this one file.

- [ ] **Step 4:** Run the test → PASS (2 tests).

- [ ] **Step 5: Commit**
```bash
git add lib/brand.jsx lib/brand.test.js && git commit -m "feat(brand): swappable trout crest + custom icon set"
```

---

### Task 2: Notes model (pure, local-first)

**Files:** Create `lib/notes-model.js`, `lib/notes-model.test.js`

**Interfaces:**
- `newNote(fields) => note` — `{ id, title, body, technique, flies, species, size, lat, lon, createdAt }`; generates `id` and `createdAt`; missing fields default to "" / null.
- `hasPin(note) => boolean` — true when both `lat` and `lon` are numbers.
- `gmapsPinUrl(note) => string|null` — Google Maps pin URL for a pinned note, else null.

- [ ] **Step 1: Failing test** `lib/notes-model.test.js`:
```js
import { describe, it, expect } from "vitest";
import { newNote, hasPin, gmapsPinUrl } from "./notes-model.js";
describe("notes model", () => {
  it("creates a note with id + createdAt and blank defaults", () => {
    const n = newNote({ title: "Forks", technique: "euro nymph" });
    expect(n.id).toBeTruthy();
    expect(n.createdAt).toBeTruthy();
    expect(n.title).toBe("Forks");
    expect(n.body).toBe("");
    expect(hasPin(n)).toBe(false);
  });
  it("recognises a GPS pin and builds a maps url", () => {
    const n = newNote({ title: "Run", lat: 43.78, lon: -80.0 });
    expect(hasPin(n)).toBe(true);
    expect(gmapsPinUrl(n)).toContain("43.78");
    expect(gmapsPinUrl(newNote({ title: "x" }))).toBe(null);
  });
});
```

- [ ] **Step 2:** Run `npx vitest run lib/notes-model.test.js` → FAIL.

- [ ] **Step 3: Implement** `lib/notes-model.js`:
```js
export function newNote(f = {}) {
  return {
    id: "n" + Date.now() + Math.random().toString(36).slice(2, 7),
    title: f.title || "", body: f.body || "",
    technique: f.technique || "", flies: f.flies || "",
    species: f.species || "", size: f.size || "",
    lat: typeof f.lat === "number" ? f.lat : null,
    lon: typeof f.lon === "number" ? f.lon : null,
    createdAt: new Date().toISOString(),
  };
}
export function hasPin(n) { return typeof n.lat === "number" && typeof n.lon === "number"; }
export function gmapsPinUrl(n) {
  return hasPin(n) ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(n.lat + "," + n.lon)}` : null;
}
```

- [ ] **Step 4:** Run → PASS (2 tests).

- [ ] **Step 5: Commit**
```bash
git add lib/notes-model.js lib/notes-model.test.js && git commit -m "feat(notes): pure local-first notes model"
```

---

### Task 3: Radius presets (pure)

**Files:** Create `lib/radius.js`, `lib/radius.test.js`

**Interfaces:** `RADIUS_PRESETS` = `[{label:"30 km",m:30000},{label:"60 km",m:60000},{label:"120 km",m:120000},{label:"150 km",m:150000}]`; `radiusLabel(m) => string` (nearest preset label, e.g. `"120 km"`).

- [ ] **Step 1: Failing test** `lib/radius.test.js`:
```js
import { describe, it, expect } from "vitest";
import { RADIUS_PRESETS, radiusLabel } from "./radius.js";
describe("radius", () => {
  it("has presets and labels a value", () => {
    expect(RADIUS_PRESETS.length).toBe(4);
    expect(radiusLabel(120000)).toBe("120 km");
    expect(radiusLabel(30000)).toBe("30 km");
  });
});
```

- [ ] **Step 2:** Run → FAIL.

- [ ] **Step 3: Implement** `lib/radius.js`:
```js
export const RADIUS_PRESETS = [
  { label: "30 km", m: 30000 }, { label: "60 km", m: 60000 },
  { label: "120 km", m: 120000 }, { label: "150 km", m: 150000 },
];
export function radiusLabel(m) {
  let best = RADIUS_PRESETS[0];
  for (const p of RADIUS_PRESETS) if (Math.abs(p.m - m) < Math.abs(best.m - m)) best = p;
  return best.label;
}
```

- [ ] **Step 4:** Run → PASS.

- [ ] **Step 5: Commit**
```bash
git add lib/radius.js lib/radius.test.js && git commit -m "feat: radius presets"
```

---

### Task 4: Navigation shell — TopBar, Drawer, 3-tab TabBar

**Files:** Modify `source-app.jsx`

**Interfaces:** Consumes `Crest`, `Icon` (Task 1), `RADIUS_PRESETS`/`radiusLabel` (Task 3). Produces new tab model: `tab ∈ {"rivers","news","notes"}` (default `"rivers"`).

- [ ] **Step 1:** Import at top of `source-app.jsx`:
```js
import { Crest, Icon } from "./lib/brand.jsx";
import { RADIUS_PRESETS, radiusLabel } from "./lib/radius.js";
```
- [ ] **Step 2:** Change tab state default: replace `const [tab,setTab]=useState("today");` with `const [tab,setTab]=useState("rivers");` and add `const [drawerOpen,setDrawerOpen]=useState(false);` and `const [riversView,setRiversView]=useState("list");`.
- [ ] **Step 3:** Replace the header block (the `HeaderCrest` + title + status + old `<h1>` intro + old tab bar) with: a **TopBar** (`<Crest size={38}/>` + "Muddy York / Angling Co." + a hamburger button `<Icon name="menu"/>` → `setDrawerOpen(true)`), and remove the 6-button tab row entirely.
- [ ] **Step 4:** Add the bottom **TabBar** just before the closing root `</div>`: three buttons (`rivers` `<Icon name="rivers"/>`, `news` `<Icon name="news"/>`, `notes` `<Icon name="notes"/>`), fixed to bottom with `env(safe-area-inset-bottom)` padding, brass active colour; each calls `setTab(id)`. Add matching bottom padding to the content container so content isn't hidden behind it.
- [ ] **Step 5:** Add the **Drawer** (render when `drawerOpen`): overlay + left panel with the crest lockup and links — Rivers/News/Notes (call `setTab` + close), a divider, then Account (opens `setAuthOpen(true)` when `API_BASE`), Condition alerts, Search radius, Method & sources, and the before-you-fish note. Close on overlay click and Esc.
- [ ] **Step 6:** Update the tab conditionals: `tab==="map"||"today"||"database"` → **rivers**; `tab==="news"` stays; `tab==="saved"||"method"` → folded into **notes** (Task 7/8). Delete the now-unused `tabBtn` helper.
- [ ] **Step 7:** Build + verify.
```bash
npm run build
```
Then serve locally and confirm: TopBar shows the crest, hamburger opens the drawer, three bottom tabs switch views, no old tabs remain.
- [ ] **Step 8: Commit**
```bash
git add source-app.jsx app.js && git commit -m "feat(nav): topbar + drawer + 3-tab bar"
```

---

### Task 5: Compact meta strip + radius control

**Files:** Modify `source-app.jsx`

**Interfaces:** Consumes `radiusLabel`, `RADIUS_PRESETS`, `setRadiusM`/`discoverNearby`.

- [ ] **Step 1:** Replace the old data/control panel (the large `background:C.panel … Planning a trip …` block) with a **MetaStrip**: one flex row of four compact cells — date (`fmtDate`), now (`{Math.round(userWx.air)}° {WX_CODE}` or `—`), season, and **radius** (`radiusLabel(radiusM)`, tappable → opens a radius sheet). Not sticky; lives in the scroll area.
- [ ] **Step 2:** Add a **RadiusSheet** (shown from the meta strip or drawer): lists `RADIUS_PRESETS`; tapping one calls `setRadiusM(p.m)` and, if `userLoc`, `discoverNearby(p.m)`, then closes. Replaces the "Widen search" button.
- [ ] **Step 3:** Keep the location button ("Use my location") and "Find water near me" inside the Rivers tab controls (moved out of the removed panel), but drop the verbose planning copy.
- [ ] **Step 4:** Build + verify the strip is compact, scrolls away, and the radius sheet changes results.
- [ ] **Step 5: Commit**
```bash
git add source-app.jsx app.js && git commit -m "feat: compact meta strip + radius control"
```

---

### Task 6: Rivers tab — List/Map toggle + restyled cards

**Files:** Modify `source-app.jsx`

- [ ] **Step 1:** Under the meta strip, add a pinned **List/Map segmented toggle** (`<Icon name="list"/>` / `<Icon name="map"/>`) bound to `riversView`.
- [ ] **Step 2:** When `tab==="rivers"`: render the **List** (today's ranked `RecCard`s + honourable, with existing `Locked` gating) when `riversView==="list"`, and the existing `<MapView …/>` when `riversView==="map"`. Remove the standalone Map/Report/Rivers tab bodies.
- [ ] **Step 3:** Restyle `RecCard` per the mockup: rank label, 21px serif river name, section+distance, source badge with `<Icon name="check"/>`, the score ring (keep `scoreColor`+`scoreWord`), species pills, plain-language explanation, a **3-up conditions grid** (Water/Flow/Wind), and action buttons using `<Icon name="fly"/>` (Strategy & flies) and `<Icon name="pin"/>` (Route). No emojis.
- [ ] **Step 4:** Keep "Reading live weather, river by river." as a one-line subtitle **only** here.
- [ ] **Step 5:** Build + verify list and map toggle, gating still works (sign-out shows locks).
- [ ] **Step 6: Commit**
```bash
git add source-app.jsx app.js && git commit -m "feat(rivers): list/map toggle + restyled cards"
```

---

### Task 7: Map → route reflowing sheet

**Files:** Modify `source-app.jsx` (`MapView`)

**Interfaces:** Add local `sheetMode ∈ {"info","route"}` to `MapView`.

- [ ] **Step 1:** Replace the selected-spot card with a single bottom **sheet** with a grab handle. In `info` mode show: title (river/section/distance), basic info (species pills + water/flow chips + score ring). Tapping **Route** sets `sheetMode="route"` (does not open a second panel).
- [ ] **Step 2:** In `route` mode, the same sheet shows: the title + basic info at top (condensed), then **route steps** — Drive (`<Icon name="drive"/>` time/distance to parking) then Walk the trail (`<Icon name="walk"/>` time/distance to access) — then actions: **Open in Google Maps** (`gmapsDirections`) and Close. Parking/route stays wrapped in `Locked` for non-premium.
- [ ] **Step 3:** Selecting a different marker resets `sheetMode="info"`.
- [ ] **Step 4:** Build + verify: tapping Route reflows the same sheet (title → basics → route), no leftover card above it.
- [ ] **Step 5: Commit**
```bash
git add source-app.jsx app.js && git commit -m "feat(map): single reflowing route sheet"
```

---

### Task 8: Notes tab (private, local-first, GPS pin)

**Files:** Modify `source-app.jsx`

**Interfaces:** Consumes `newNote`, `hasPin`, `gmapsPinUrl` (Task 2); existing `dbGet`/`dbSet`, `saved` state, `requestLocation`/`userLoc`.

- [ ] **Step 1:** Add `notes` state loaded from `dbGet("notes")` on startup; `addNote(fields)` prepends `newNote(fields)` and `dbSet("notes", next)`; `removeNote(id)` filters + persists.
- [ ] **Step 2:** Build the **Notes tab** (`tab==="notes"`): (a) **Saved water** list from `saved` (each with river/section + a "Log a note" action prefilling the note form); (b) a **note composer** — title, body, technique, flies, species, approx size — plus a **"Drop a pin here"** button that calls `requestLocation` and attaches `userLoc` to the note (`newNote({...fields, lat, lon})`); (c) the **notes list**, each showing fields, date, and an **Open in Google Maps** link when `hasPin`, with delete.
- [ ] **Step 3:** At the bottom of the Notes tab, add a small **Overall score** box (top pick's `overall`) and the **Before you fish** regulations warning (moved from the old Method tab).
- [ ] **Step 4:** Remove the old `SavedView` tab usage and the old method/about `Notes` tab; move Method text into the drawer link target (a simple modal or inline panel).
- [ ] **Step 5:** Build + verify: create a note, drop a GPS pin (allow location), reload → note persists with a working Maps link; notes are local only (no network).
- [ ] **Step 6: Commit**
```bash
git add source-app.jsx app.js && git commit -m "feat(notes): private local notes + GPS pins"
```

---

### Task 9: News tab — social-style cards

**Files:** Modify `source-app.jsx` (`NewsView`/`FeedCard`)

- [ ] **Step 1:** Restyle `FeedCard` as a **social post**: a source/avatar mark (crest chip), title (serif), body, a category chip, timestamp, and a like/comment action row (`<Icon name="like"/>` + a comment icon) — visually present, non-functional for now.
- [ ] **Step 2:** Never render any location on catch-style items (the existing derived items already omit exact locations; keep it that way).
- [ ] **Step 3:** Add a disabled **"Share your catch"** composer affordance with copy: "Posting catches, photos and comments arrives soon." (Phase C).
- [ ] **Step 4:** Remove "Reading live weather…" and any planning copy from this tab.
- [ ] **Step 5:** Build + verify the feed reads like posts; no locations shown.
- [ ] **Step 6: Commit**
```bash
git add source-app.jsx app.js && git commit -m "feat(news): social-style post cards"
```

---

### Task 10: Emoji sweep + typography/palette pass + verify

**Files:** Modify `source-app.jsx`

- [ ] **Step 1:** Grep for any remaining emoji/glyph literals and replace each with `<Icon .../>`:
```bash
grep -nE "🔍|🗺️|📍|🚗|🪶|◉|◆|★|☆|✕|＋|↻|›|→|▴|▾" source-app.jsx
```
Replace: search→`search`, map→`map`, pin→`pin`, drive→`drive`, fly→`fly`, located→`account`/`pin`, save filled/empty→`save`, close→`close`, plus→`plus`, refresh→`refresh`, chevrons→`Icon` carets or CSS. Keep `SectionTitle`'s diamond as an `<Icon name="check"/>` or a styled span (no emoji).
- [ ] **Step 2:** Apply the type scale: body ≥14px, river names 21px serif, labels ≥9.5px; bump the smallest `fontSize:7/8/9` occurrences. Apply the deepened palette values to `C` where they differ (pine-deep, panel `#FFFDF8`, ink `#20241F`, dim `#6E6858`).
- [ ] **Step 3:** Update the boot text / `index.html` theme colour if needed (keep the crest favicon separate; that's a later asset swap).
- [ ] **Step 4:** Build + run the full suite:
```bash
npm run build && npm test
```
Expected: `built app.js`, all frontend tests pass (existing 27 + brand/notes/radius = 33+).
- [ ] **Step 5:** Browser verification checklist: three tabs only; drawer; List⟷Map; route sheet reflow; notes + GPS pin; social news; no emoji visible; text ≥14px; paywall locks on sign-out.
- [ ] **Step 6: Commit + tag**
```bash
git add source-app.jsx app.js && git commit -m "feat: emoji sweep + typography/palette pass"
git commit --allow-empty -m "chore: Phase A redesign complete"
```

---

## Self-Review

**Spec coverage:** brand/crest/icons (T1), notes model (T2), radius (T3), nav shell/drawer/tabs (T4), meta strip + radius control (T5), Rivers list/map + restyle (T6), route sheet reflow (T7), Notes tab + GPS pin + score/warning box (T8), News social cards (T9), emoji sweep + typography + palette + copy cleanup (T10). IA collapse (6→3 tabs, Saved/Rivers/Map removed) spans T4/T6/T8. All spec sections mapped.

**Placeholder scan:** none — pure modules have full code + tests; UI tasks give exact components, icon names, and grep commands. UI is browser-verified (React components with network/DOM), consistent with prior frontend phases.

**Type/name consistency:** `Icon name` values come from `ICON_NAMES` (T1) and are the same strings used in T4–T10. `newNote/hasPin/gmapsPinUrl` (T2) used in T8. `RADIUS_PRESETS/radiusLabel` (T3) used in T4/T5. `tab` values `rivers|news|notes` and `riversView` `list|map`, `sheetMode` `info|route` are consistent across T4–T9. Existing `Locked`, `isPremium`, `RecCard`, `MapView`, `scoreColor`, `scoreWord`, `dbGet/dbSet`, `saved`, `radiusM`, `discoverNearby` reused with their current signatures.
