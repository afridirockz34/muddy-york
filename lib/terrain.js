/* Batched elevation via Open-Meteo elevation API. */
function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

export async function elevations(points, opts = {}) {
  const { fetchImpl = fetch } = opts;
  const out = [];
  for (const group of chunk(points, 100)) {
    const lats = group.map((p) => p.lat).join(",");
    const lons = group.map((p) => p.lon).join(",");
    try {
      const res = await fetchImpl(
        `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lons}`
      );
      if (!res.ok) throw new Error("bad");
      const d = await res.json();
      const arr = Array.isArray(d.elevation) ? d.elevation : [];
      group.forEach((_, i) => out.push(arr[i] != null ? arr[i] : 200));
    } catch (e) {
      group.forEach(() => out.push(200));
    }
  }
  return out;
}
