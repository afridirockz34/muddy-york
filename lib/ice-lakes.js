// Ice-fishing lakes we cover by name. `species` are the ice-fishing species in
// Ontario's Aquatic Resource Area lake record for each lake (fetched Oct 13,
// 2026, marketing/seo-data/ice-lakes-ara.json); depth is read live.
export const ICE_LAKES = [
  { id: "lake-simcoe", species: ["WAL", "YP", "NP", "LAT", "LWF", "CRP", "CIS"], name: "Lake Simcoe", lat: 44.42, lon: -79.37, page: "/ice-fishing/lake-simcoe/", areas: ["Cook's Bay", "Kempenfelt Bay", "Keswick", "Beaverton", "Innisfil"] },
  { id: "lake-nipissing", species: ["WAL", "YP", "NP", "LWF", "CIS"], name: "Lake Nipissing", lat: 46.25, lon: -79.75, page: "/ice-fishing/lake-nipissing/", areas: ["North Bay", "Callander Bay", "Sturgeon Falls"] },
  { id: "bay-of-quinte", name: "Bay of Quinte", lat: 44.16, lon: -77.30, page: "/ice-fishing/bay-of-quinte/", areas: ["Belleville", "Trenton", "Picton"], araName: "Lake Ontario",
    // Ontario files the bay with Lake Ontario; keep to the bay's own ice fish.
    species: ["WAL", "YP", "NP", "CRP", "LWF"] },
  { id: "rice-lake", species: ["WAL", "YP", "NP", "CRP"], name: "Rice Lake", lat: 44.18, lon: -78.20, page: "/ice-fishing/rice-lake/", areas: ["Bewdley", "Gores Landing", "Hastings"] },
  { id: "lake-scugog", species: ["WAL", "YP", "NP", "CRP"], name: "Lake Scugog", lat: 44.14, lon: -78.85, page: "/ice-fishing/lake-scugog/", areas: ["Port Perry", "Caesarea"] },
];
