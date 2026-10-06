// Same query the app uses, so the server cache and a direct fallback agree.
export { buildOverpassQuery as buildDiscoverQuery } from "../../../lib/discovery.js";
export function buildParkingQuery(lat, lon) {
  const a = `around:1500,${lat},${lon}`;
  return `[out:json][timeout:20];(` +
    `node["amenity"="parking"](${a});way["amenity"="parking"](${a});` +
    `node["leisure"="slipway"](${a});` +
    `);out center 25;`;
}
