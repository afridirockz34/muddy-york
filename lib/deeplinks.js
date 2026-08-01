/* Google Maps universal deep links — no API key required. */
export function gmapsDirections(lat, lon, mode = "driving") {
  const dest = encodeURIComponent(`${lat},${lon}`);
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=${mode}`;
}
export function gmapsPin(lat, lon) {
  const q = encodeURIComponent(`${lat},${lon}`);
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}
/* Google Images search — lets anglers see what a fly/bait actually looks like. */
export function gImages(query) {
  return `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}`;
}
