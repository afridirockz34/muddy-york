const f = (n) => Math.round(n * 1000) / 1000;
export function buildBathyUrl(lat, lon, halfDeg = 0.02) {
  const bbox = `${f(lon - halfDeg)},${f(lat - halfDeg)},${f(lon + halfDeg)},${f(lat + halfDeg)}`;
  return `https://ws.lioservices.lrc.gov.on.ca/arcgis2/rest/services/LIO_OPEN_DATA/LIO_Open01/MapServer/30/query` +
    `?geometry=${bbox}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects` +
    `&outFields=DEPTH&returnGeometry=false&f=json&resultRecordCount=2000`;
}
export function parseBathy(json) {
  const feats = (json && json.features) || [];
  const depths = feats.map((x) => x.attributes && x.attributes.DEPTH).filter((d) => d != null).map((d) => Math.abs(d));
  if (!depths.length) return null;
  const maxDepthM = Math.round(Math.max(...depths) * 10) / 10;
  return { maxDepthM, contourCount: depths.length, deepHole: maxDepthM >= 6 };
}
