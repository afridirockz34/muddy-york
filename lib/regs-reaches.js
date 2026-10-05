// Which official Ontario regulation entries govern each river section in the app.
//
// Each section is split into the legal stretches the regulations use (they
// often change at a bridge or highway). A stretch lists `match` specs that pick
// entries out of the parsed zone page:
//   kind: "spx"   species exception ("Additional fishing opportunities") water
//         "wb"    waterbody exception (rules listed under the water)
//         "sanct" fish sanctuary water
//   name: the official water name the entry starts with
//   has:  phrases the entry text must contain (to pick the right stretch)
//   not:  phrases it must not contain (e.g. "tributaries" when only the main
//         river is meant)
// A spec that matches nothing means Ontario reworded or removed the entry; the
// stretch then shows "Check regs" and the sync flags it for review — the app
// never falls back to guessing.
//
// `review: true` marks a stretch whose governing rule we could not pin to an
// official entry (usually a Great Lakes river mouth, which the summary maps
// rather than lists). It always shows "Check regs", with the closest official
// entries and a link, instead of a computed open/closed.

const CREDIT = "Credit River";
const DURHAM = "Regional Municipality of Durham";
const BRUCE_GREY = { kind: "wb", name: "Bruce and Grey Counties", has: ["inland rivers and streams"] };

export const REACH_REGS = {
  "grand-tw": { zone: 16, stretches: [
    { label: "Fergus, Elora and West Montrose special-regulation stretches",
      match: [{ kind: "wb", name: "Grand River", has: ["West Garafraxa second Line"] }] },
  ] },
  "grand-lower": { zone: 16, stretches: [
    { label: "Caledonia to Lake Erie",
      match: [
        { kind: "spx", name: "Grand River", has: ["Paris at 100 metres downstream", "edge of Lake Erie"] },
        { kind: "wb", name: "Grand River", has: ["Brant Conservation Area in the City of Brantford to the edge of Lake Erie"] },
        { kind: "wb", name: "Grand River", has: ["Haldimand County"] },
        { kind: "wb", name: "Grand River and its tributaries", has: ["Onondaga and Tuscarora"] },
      ] },
  ] },
  "credit-lower": { zone: 16, stretches: [
    { label: "Lake Ontario to Hwy 403",
      match: [{ kind: "spx", name: CREDIT, has: ["Highway 403 bridge downstream to Lake Ontario"] }] },
    { label: "Hwy 403 to Britannia Rd (Streetsville)",
      match: [{ kind: "wb", name: CREDIT, has: ["south side of the Highway 403 bridge", "Britannia Road bridge"] }] },
  ] },
  "credit-mid": { zone: 16, stretches: [
    { label: "Norval to Glen Williams (above Hwy 407)",
      match: [{ kind: "wb", name: CREDIT, has: ["Britannia Road bridge in the Village of Streetsville, upstream to the south side of the Old Baseline Road"] }] },
  ] },
  "credit-upper": { zone: 16, stretches: [
    { label: "Old Baseline Rd to Hwy 9 (Forks of the Credit, Belfountain)",
      match: [
        { kind: "wb", name: CREDIT, has: ["Upstream of Old Baseline Road"] },
        { kind: "wb", name: CREDIT, has: ["south side of the Old Baseline Road bridge", "upstream to Highway 9"] },
      ] },
  ] },
  "humber-lower": { zone: 16, stretches: [
    { label: "Eglinton Ave to Lake Ontario",
      match: [{ kind: "spx", name: "Humber River", has: ["between Eglinton Avenue and Lake Ontario"] }] },
  ] },
  "rouge-lower": { zone: 16, stretches: [
    { label: "Kingston Rd (Hwy 2) to Lake Ontario",
      match: [{ kind: "spx", name: "Rouge River", has: ["between Highway 2 (Kingston Road) and Lake Ontario"] }] },
    { label: "Above Kingston Rd (Twyn Rivers)",
      match: [{ kind: "spx", name: "Rouge River", has: ["from Highway 2 (Kingston Road)", "Highway 407"] }] },
  ] },
  "bronte": { zone: 16, stretches: [
    { label: "Lakeshore Rd (Hwy 2) to Lake Ontario",
      match: [{ kind: "spx", name: "Bronte Creek", has: ["Highway 2 (Lakeshore Road West) to Lake Ontario"] }] },
    { label: "Lakeshore Rd up to Hwy 407",
      match: [{ kind: "spx", name: "Bronte Creek", has: ["upstream to the south side of Highway 407"] }] },
  ] },
  "sixteen": { zone: 16, stretches: [
    { label: "Lakeshore Rd (Hwy 2) to Lake Ontario",
      match: [{ kind: "spx", name: "Sixteen Mile Creek (Oakville Creek)", has: ["Town of Oakville, from Highway 2 (Lakeshore Road) to Lake Ontario"] }] },
    { label: "Lakeshore Rd up to Hwy 407",
      match: [{ kind: "spx", name: "Sixteen Mile Creek (Oakville Creek)", has: ["upstream to the south side of Highway 407"] }] },
  ] },
  "twelve-mile": { zone: 16, stretches: [
    { label: "Short Hills cold reach (inland)", match: [], zoneWideOnly: true },
  ] },
  "ganaraska": { zone: 17, stretches: [
    { label: "Hwy 401 to Jocelyn St bridge",
      match: [{ kind: "sanct", name: "Ganaraska River", has: ["Highway 401 downstream to the south side of the Jocelyn Street Bridge"] }] },
    { label: "Jocelyn St bridge to the CNR tracks",
      match: [
        { kind: "spx", name: "Ganaraska River", has: ["Jocelyn Street Bridge", "CNR right-of-way"] },
        { kind: "sanct", name: "Ganaraska River", has: ["Jocelyn Street Bridge", "C.N.R. right-of-way"] },
      ] },
    { label: "CNR tracks to Lake Ontario",
      match: [{ kind: "spx", name: "Ganaraska River", has: ["southerly limit of the CNR right-of-way and Lake Ontario"] }] },
  ] },
  "duffins": { zone: 17, stretches: [
    { label: "CNR tracks to Lake Ontario",
      match: [{ kind: "spx", name: DURHAM, has: ["southerly limit of the CNR right-of-way and Lake Ontario"] }] },
    { label: "Hwy 2 to the CNR tracks",
      match: [{ kind: "spx", name: DURHAM, has: ["between Highway 2 and the southerly limit of the CNR"] }] },
    { label: "Above Hwy 2", match: [], zoneWideOnly: true },
  ] },
  "wilmot": { zone: 17, stretches: [
    { label: "CNR tracks to Lake Ontario",
      match: [{ kind: "spx", name: DURHAM, has: ["southerly limit of the CNR right-of-way and Lake Ontario"] }] },
    { label: "Hwy 2 (Newcastle) to the CNR tracks",
      match: [{ kind: "spx", name: DURHAM, has: ["between Highway 2 and the southerly limit of the CNR"] }] },
  ] },
  "bowmanville": { zone: 17, stretches: [
    { label: "CNR tracks to Lake Ontario",
      match: [{ kind: "spx", name: DURHAM, has: ["southerly limit of the CNR right-of-way and Lake Ontario"] }] },
    { label: "Hwy 2 to the CNR tracks",
      match: [{ kind: "spx", name: DURHAM, has: ["between Highway 2 and the southerly limit of the CNR"] }] },
  ] },
  "niagara-lower": { zone: 20, stretches: [
    { label: "Below the Falls (Whirlpool, Devil's Hole)", match: [], zoneWideOnly: true,
      note: "The Niagara River downstream of the falls is in Zone 20." },
  ] },
  "notty-main": { zone: 16, stretches: [
    { label: "Below the Boyne River (Angus to Wasaga)",
      match: [
        { kind: "spx", name: "Nottawasaga River", has: ["from the Boyne River downstream (north) to Georgian Bay"] },
        { kind: "wb", name: "Nottawasaga River", has: ["from the Boyne River downstream (north) to the Pine River"] },
      ] },
  ] },
  "notty-tribs": { zone: 16, stretches: [
    { label: "Mad, Boyne and Pine rivers (general)", match: [], zoneWideOnly: true },
    { label: "Boyne River in Earl Rowe Provincial Park",
      match: [{ kind: "sanct", name: "Boyne River", has: ["Earl Rowe Provincial Park"] }] },
  ] },
  "boyne": { zone: 16, stretches: [
    { label: "Primrose / Boyne valley headwaters", match: [], zoneWideOnly: true },
  ] },
  "conestogo-tw": { zone: 16, stretches: [
    { label: "Below Conestogo Dam", match: [], zoneWideOnly: true },
  ] },
  "beaver-lower": { zone: 16, stretches: [
    { label: "Thornbury Dam to Georgian Bay",
      match: [{ kind: "spx", name: "Beaver River", has: ["Thornbury Dam to Georgian Bay"] }] },
  ] },
  "beaver-upper": { zone: 16, stretches: [
    { label: "Kimberley to below Eugenia (Grey County inland)", match: [BRUCE_GREY] },
  ] },
  "bighead": { zone: 16, stretches: [
    { label: "Meaford to Georgian Bay",
      match: [{ kind: "spx", name: "Bighead River", has: ["St. Vincent Township"] }] },
  ] },
  "sydenham-os": { zone: 16, stretches: [
    { label: "Mill Dam to 177 m downstream",
      match: [{ kind: "wb", name: "Sydenham River", has: ["Mill Dam to a point 177 metres downstream"] }] },
    { label: "Below the sanctuary to Owen Sound harbour", review: true, match: [BRUCE_GREY],
      note: "Grey County inland rules likely apply; the river mouth may fall under Georgian Bay (Zone 14) rules." },
  ] },
  "saugeen-denny": { zone: 16, stretches: [
    { label: "Denny's Dam to the concrete abutments",
      match: [
        { kind: "spx", name: "Saugeen River", has: ["concrete abutments downstream of Denny’s Dam"] },
        { kind: "wb", name: "Saugeen River", has: ["Denny’s Dam to the concrete abutments downstream"] },
      ] },
    { label: "Abutments to the mouth (Southampton)", review: true,
      match: [{ kind: "spx", name: "Saugeen River", has: ["concrete abutments downstream of Denny’s Dam"] }],
      note: "The extended season listed runs down to the abutments below Denny's Dam; below them the river mouth may fall under Lake Huron (Zone 13) rules." },
  ] },
  "maitland-lower": { zone: 16, stretches: [
    { label: "Benmiller to the Hwy 21 bridge",
      match: [
        { kind: "spx", name: "Maitland River", has: ["between County Road 4 and the downstream side of the Highway 21 bridge"] },
        { kind: "wb", name: "Maitland River", has: ["from the downstream side of the bridge on Highway 21 to the upstream side of the bridge on County Road 4"], not: ["tributaries"] },
        { kind: "wb", name: "Maitland River", has: ["Falls Reserve Waterfall"] },
      ] },
    { label: "Hwy 21 bridge to the mouth (Goderich)", review: true, match: [],
      note: "Below the Highway 21 bridge the river mouth may fall under Lake Huron (Zone 13) rules." },
  ] },
  "sauble": { zone: 16, stretches: [
    { label: "First 440 m below Sauble Falls",
      match: [{ kind: "spx", name: "Sauble River", has: ["lowest ledge of Sauble Falls"] }] },
    { label: "Rest of the river to the mouth", review: true, match: [BRUCE_GREY],
      note: "Bruce County inland rules likely apply; the river mouth may fall under Lake Huron (Zone 13) rules." },
  ] },
};

// The app's species codes → the species names used in the official summary.
export const OFFICIAL_SPECIES = {
  STL: "Rainbow trout", RBT: "Rainbow trout", BNT: "Brown trout", BNTr: "Brown trout", BKT: "Brook trout",
  CHN: "Pacific salmon", COH: "Pacific salmon", ATS: "Atlantic salmon", LAT: "Lake trout",
  SMB: "Largemouth and smallmouth bass combined", NP: "Northern pike", WAL: "Walleye and sauger combined",
};
