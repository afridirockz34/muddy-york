/* Google Maps universal deep links — no API key required. */
export function gmapsDirections(lat, lon, mode = "driving") {
  const dest = encodeURIComponent(`${lat},${lon}`);
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=${mode}`;
}
/* Apple Maps (pre-installed on iOS) — keeps the destination and never bounces to
   the App Store the way a google.com/maps link does when Google Maps isn't
   installed. dirflg=d = driving. */
export function appleMapsDirections(lat, lon) {
  return `https://maps.apple.com/?daddr=${encodeURIComponent(`${lat},${lon}`)}&dirflg=d`;
}
export function isIOS(ua) {
  const s = ua != null ? ua : (typeof navigator !== "undefined" ? navigator.userAgent : "");
  // iPhone/iPad, incl. iPadOS 13+ which reports as Macintosh but has touch.
  return /iPad|iPhone|iPod/.test(s) ||
    (/Macintosh/.test(s) && typeof navigator !== "undefined" && (navigator.maxTouchPoints || 0) > 1);
}
/* Pick the directions provider that behaves best on the current device. */
export function directionsUrl(lat, lon, ua) {
  return isIOS(ua) ? appleMapsDirections(lat, lon) : gmapsDirections(lat, lon);
}
export function gmapsPin(lat, lon) {
  const q = encodeURIComponent(`${lat},${lon}`);
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}
/* Google Images search — lets anglers see what a fly/bait actually looks like. */
export function gImages(query) {
  return `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}`;
}
