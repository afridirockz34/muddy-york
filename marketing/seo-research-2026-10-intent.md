# Buyer-intent keywords: research and plan (October 20, 2026)

Goal: rank for searches from people who want what the app does (where to fish,
today's water, fly fishing), not only for one-off salmon-run sightseeing.

Sources: DataForSEO Google Ads search volumes for Ontario (338 keywords,
`seo-data/intent_volumes.json`), keyword ideas from 8 seeds
(`seo-data/intent_ideas.json`), and Google.ca mobile results, top 20, for 28
keywords (`seo-data/intent_serps.json`). Cost about $0.28.

## What people search (Ontario, monthly)

| Keyword | Searches | Where we ranked (Oct 20) | Who ranks |
|---|---|---|---|
| fishing spots near me | 8,100 | not in top 20 | Map pack, Destination Ontario, Reddit |
| grand river fishing | 390 | not in top 20 | YouTube, Reddit, Orvis, Hooked Ontario |
| trout fishing near me | 390 | not in top 20 | Destination Ontario, Reddit, Fishingbooker |
| fishing spots ontario | 320 | not in top 20 | Destination Ontario, Ontario GeoHub |
| beaver river fishing | 260 | not in top 20 | ontario.ca, A Perfect Drift |
| credit river fishing | 260 | not in top 20 | Ontario Trout & Steelhead, CRAA, CVC |
| grand river water level | 260 | not in top 20 | grandriver.ca, riverapp.net |
| grand river water temperature | 170 | not in top 20 | grandriver.ca, riverapp.net |
| humber river fishing | 170 | not in top 20 | Ontario Trout & Steelhead, A Perfect Drift |
| saugeen river fishing | 170 | not in top 20 | Ontario Trout & Steelhead, Saugeen Conservation |
| bronte creek fishing | 170 | not in top 20 | Facebook, Reddit, Fishingbooker |
| fishing spots toronto | 170 | not in top 20 | Reddit, Destination Ontario |
| niagara river fishing report | 170 | not in top 20 | guides, Fishingbooker |
| fly fishing ontario | 140 | not in top 20 | Destination Ontario, outfitters, Reddit |
| grand river flow | 140 | not checked | grandriver.ca |
| nottawasaga river fishing | 140 | not in top 20 | Reddit, YouTube |
| credit river water level | 110 | not in top 20 | cvc.ca |
| fly fishing near me | 90 | **#7** | Yelp, lodges, shops |
| trout streams near me | 90 | not in top 20 | Northern Ontario Travel, Ontario Trout & Steelhead |
| fly fishing toronto | 70 | not in top 20 | Drift Outfitters, Reddit, Tripadvisor |
| best fishing app | 50 | not in top 20 | US and UK roundups |
| fishing app ontario | 40 | not in top 20 | Ontario's Fish ON-Line, Reddit |
| credit river fishing spots | 40 | not in top 20 | Anglers Atlas, CRAA |
| credit river water temperature | 30 | not in top 20 | cvc.ca |
| fly fishing app | 10 | not checked | |

Pattern: for nearly every river, "[river] fishing" is the big search, then
"water level", "flow", "water temperature", "fishing spots" and "fishing map".
"Fly fishing app" itself is small in Ontario (10 to 50), so the app sells
through the river and conditions searches, not through "app" searches.

## Why we weren't ranking

1. **Split pages.** The Credit had three section pages plus a salmon-run page
   and a steelhead page, none of them "the Credit River fishing page".
2. **No live water data.** People searching "water level" or "flow" want a
   number. Our pages sent them to the Water Survey of Canada instead.
3. **Titles aimed at salmon and towns**, not at spots, water level or fly fishing.
4. **No fly fishing hub, no app page, no near-me page.**

## What we built (October 20)

- **River main pages** for the rivers we cover in several sections:
  `/rivers/credit-river/`, `/rivers/grand-river/`, `/rivers/beaver-river/`.
  Spots by section, live level and flow for each section, water temperature
  guidance, seasons by section, flies, best months, FAQ.
- **Live water level, flow and 24-hour trend** on every river page, from a
  hand-picked Water Survey of Canada gauge on that river. The nearest gauge
  is often on another creek (Mimico Creek for the Humber, Fourteen Mile for
  Bronte), so each stretch names its gauge. The lower Niagara has none, and
  the page says so. The app's river report now uses the same list.
- **Every river page:** new "water level and flow today", "water temperature",
  "fishing spots" and "fly fishing" sections, plus FAQ answers for each.
- **New titles** on nine river pages (Humber, Credit lower, Saugeen, Bronte,
  Ganaraska, Nottawasaga, Niagara, Maitland, Rouge) toward spots and water level.
- `/fly-fishing/`: Ontario fly fishing hub (tailwaters, cold creeks, lake-run
  rivers, with today's season status on each).
- `/fly-fishing-app/`: what the app does, pricing, install steps,
  SoftwareApplication data.
- `/fishing-spots/near-me/`: every river, sorted by distance on the phone.
- Fly fishing and Spots near me added to the menu and footer, plus `llms.txt`.

Water temperature is honest: gauges here don't report it, so the pages say the
app estimates it each morning, and members' thermometer readings keep it honest.

## Next

1. After going live: Search Console, URL inspection, request indexing for the
   six new URLs. Run `node marketing/indexnow.mjs`.
2. Give it 3 to 6 weeks, then check positions for the table above.
3. Links matter most for the head terms ("credit river fishing", "fly fishing
   ontario"). Earn them honestly: river clubs (CRAA, Trout Unlimited chapters),
   the live gauge pages as a free resource, Reddit answers that help first.
4. "Fishing spots near me" (8,100) is mostly a map-pack search. A Google
   Business Profile only fits a business with a location or service area, so
   don't create one just for this.
5. When the native apps launch, App Store and Google Play pages will pick up
   "fishing app" searches.
