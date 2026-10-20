"""Intent keyword research (Oct 20, 2026): river conditions/spots and fly-fishing
app keywords. Writes intent_volumes.json, intent_ideas.json."""
import json, sys
sys.argv = [sys.argv[0]]
from dfs import post
RIVERS = ["credit river","humber river","grand river","ganaraska river","saugeen river","nottawasaga river","bronte creek",
  "duffins creek","bowmanville creek","wilmot creek","rouge river","sixteen mile creek","twelve mile creek","niagara river",
  "maitland river","sauble river","sydenham river","beaver river","bighead river","boyne river","conestogo river","oshawa creek"]
MODS = ["fishing spots","fishing","water temperature","water level","fly fishing","fishing report","flow","trout fishing",
  "steelhead fishing","fishing map","fishing access","conditions"]
kws = {f"{r} {m}" for r in RIVERS for m in MODS}
GENERIC = """fly fishing app|fly fishing app ontario|fishing app ontario|fishing app canada|best fishing app|best fly fishing app|trout fishing app|
fishing spots app|fishing conditions app|river conditions app|fishing forecast app|fishing spots near me|fly fishing spots near me|fly fishing near me|
fly fishing ontario|fly fishing toronto|fly fishing near toronto|fly fishing spots ontario|fly fishing spots toronto|best fly fishing ontario|
where to fly fish in ontario|trout fishing spots ontario|trout fishing near toronto|trout streams ontario|trout rivers ontario|brook trout fishing ontario|
brown trout fishing ontario|rainbow trout fishing ontario|trout fishing near me|trout streams near me|river fishing near me|river fishing ontario|
river fishing spots near me|steelhead fishing near me|steelhead rivers ontario|fishing report ontario|fishing conditions today|fishing conditions ontario|
river conditions ontario|river water temperature ontario|river levels ontario|ontario river flows|water temperature for trout|best water temperature for trout fishing|
fishing forecast ontario|fishing forecast toronto|best time to fish today|is it a good day to fish|where to fish today|fly fishing report ontario|
fly fishing guide ontario|fly fishing guide toronto|fly fishing lessons toronto|fly fishing for beginners ontario|fly fishing gear toronto|fly shop toronto|
euro nymphing ontario|dry fly fishing ontario|what fly to use|best flies for trout ontario|best flies for steelhead|hatch chart ontario|ontario hatch chart|
fly fishing grand river|fly fishing credit river|fly fishing humber river|fly fishing saugeen river|grand river fly fishing report|credit river fishing report|
fishing spots toronto|fishing spots mississauga|fishing spots oakville|fishing spots ontario|best fishing spots ontario|secret fishing spots ontario"""
kws |= {k.strip() for k in GENERIC.replace("\n", "").split("|") if k.strip()}
kws = sorted(kws)
print(len(kws))
post("keywords_data/google_ads/search_volume/live", [{"keywords": kws[:1000], "location_code": 20121, "language_code": "en"}], "intent_volumes.json")
seeds = ["fly fishing ontario", "fly fishing app", "credit river fishing", "grand river fly fishing", "trout fishing ontario",
  "fishing spots near me", "river water temperature", "fishing report ontario"]
post("keywords_data/google_ads/keywords_for_keywords/live", [{"keywords": seeds, "location_code": 20121, "language_code": "en", "sort_by": "search_volume"}], "intent_ideas.json")
