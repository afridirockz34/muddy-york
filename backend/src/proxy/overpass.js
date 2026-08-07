export function buildDiscoverQuery(lat, lon, radiusM) {
  const a = `around:${radiusM},${lat},${lon}`;
  return `[out:json][timeout:25];(` +
    `node["leisure"="fishing"](${a});` +
    `node["leisure"="slipway"](${a});` +
    `node["waterway"="dam"](${a});node["waterway"="weir"](${a});` +
    `way["waterway"="river"]["name"](${a});` +
    `way["waterway"="stream"]["name"](${a});` +
    `);out tags geom 200;`;
}
export function buildParkingQuery(lat, lon) {
  const a = `around:1500,${lat},${lon}`;
  return `[out:json][timeout:20];(` +
    `node["amenity"="parking"](${a});way["amenity"="parking"](${a});` +
    `node["leisure"="slipway"](${a});` +
    `);out center 25;`;
}
