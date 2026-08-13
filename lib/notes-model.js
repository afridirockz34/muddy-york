export function newNote(f = {}) {
  return {
    id: "n" + Date.now() + Math.random().toString(36).slice(2, 7),
    title: f.title || "", body: f.body || "",
    technique: f.technique || "", flies: f.flies || "",
    species: f.species || "", size: f.size || "",
    lat: typeof f.lat === "number" ? f.lat : null,
    lon: typeof f.lon === "number" ? f.lon : null,
    ref: f.ref || null,
    createdAt: new Date().toISOString(),
  };
}
export function hasPin(n) { return typeof n.lat === "number" && typeof n.lon === "number"; }
export function gmapsPinUrl(n) {
  return hasPin(n) ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(n.lat + "," + n.lon)}` : null;
}
