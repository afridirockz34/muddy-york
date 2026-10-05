RIVERS = ["grand river", "credit river", "ganaraska river", "nottawasaga river", "beaver river", "twelve mile creek",
  "bronte creek", "sixteen mile creek", "duffins creek", "wilmot creek", "niagara river", "saugeen river",
  "maitland river", "boyne river", "humber river", "conestogo river", "bighead river", "sydenham river",
  "rouge river", "bowmanville creek", "sauble river", "mad river"]
RIVER_PATTERNS = ["{} fishing", "{} fishing report", "{} salmon run", "{} steelhead fishing", "{} salmon fishing",
  "{} trout fishing", "{} fishing spots", "{} fishing map", "{} fishing regulations"]
TOWNS = ["ajax", "pickering", "oakville", "bowmanville", "newcastle", "port hope", "toronto", "mississauga", "hamilton",
  "guelph", "owen sound", "meaford", "thornbury", "collingwood", "wasaga beach", "angus", "southampton", "goderich",
  "port credit", "streetsville", "brampton", "fergus", "elora", "caledonia", "dunnville", "niagara falls",
  "st catharines", "oshawa", "barrie", "durham region"]
TOWN_PATTERNS = ["fishing {}", "{} fishing spots", "salmon fishing {}"]
GENERIC = ["ontario fishing app", "fishing app ontario", "best fishing app canada", "fly fishing app", "fishing app",
  "ontario fishing report", "fishing report ontario", "salmon run ontario", "salmon run ontario 2026", "salmon run toronto",
  "salmon run 2026", "steelhead fishing ontario", "steelhead season ontario", "trout fishing ontario", "trout season ontario",
  "trout opener ontario", "fly fishing ontario", "fly fishing near toronto", "fly fishing toronto", "fishing near me",
  "fishing spots near me", "fishing spots toronto", "fishing spots ontario", "best fishing spots ontario",
  "ontario fishing regulations", "ontario fishing season", "ontario fishing map", "fishing map ontario",
  "river conditions ontario", "ontario river levels", "brown trout fishing ontario", "chinook salmon ontario",
  "coho salmon ontario", "where to fish in ontario", "salmon fishing ontario", "best trout rivers ontario",
  "fishing licence ontario", "fishing zone 16 ontario", "fishing season ontario 2026", "rainbow trout ontario",
  "salmon spawning ontario", "old mill salmon run", "shand dam fishing", "dennys dam fishing", "corbett dam salmon",
  "port hope salmon run", "salmon run near me", "steelhead fishing near me", "trout fishing near me",
  "fly fishing near me", "fishing spots near toronto", "best fishing near toronto", "toronto fishing report"]
def all_keywords():
    kws = [p.format(r) for r in RIVERS for p in RIVER_PATTERNS] + [p.format(t) for t in TOWNS for p in TOWN_PATTERNS] + GENERIC
    seen, out = set(), []
    for k in kws:
        if k not in seen: seen.add(k); out.append(k)
    return out
