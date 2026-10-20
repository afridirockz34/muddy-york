import json, sys
sys.argv = [sys.argv[0]]
from dfs import post
KW = ["fly fishing ontario","fly fishing toronto","fly fishing near me","trout fishing near me","trout fishing ontario","fishing spots ontario",
 "fishing spots toronto","fishing app ontario","best fishing app","grand river fishing","grand river water level","grand river water temperature",
 "grand river fly fishing","credit river fishing","credit river water level","credit river water temperature","credit river fishing spots",
 "humber river fishing","beaver river fishing","saugeen river fishing","bronte creek fishing","niagara river fishing report","nottawasaga river fishing",
 "ganaraska river fishing","trout streams near me","river fishing near me","fishing spots mississauga","duffins creek fishing"]
tasks = [{"keyword": k, "location_code": 20121, "language_code": "en", "device": "mobile", "depth": 20} for k in KW]
post("serp/google/organic/live/advanced", tasks[:1], "_tmp.json")  # live endpoint takes one task per call
out = {}
for t in tasks:
    d = post("serp/google/organic/live/advanced", [t], "_tmp.json")
    out[t["keyword"]] = d["tasks"][0]["result"][0] if d["tasks"][0].get("result") else None
json.dump(out, open("intent_serps.json", "w"))
