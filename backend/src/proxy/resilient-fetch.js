const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function resilientFetch(urls, options = {}, opts = {}) {
  const { retries = 1, fetchImpl = fetch, backoffMs = 150 } = opts;
  let lastErr = new Error("no urls");
  for (const url of urls) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetchImpl(url, options);
        if (res && res.ok) return res;
        lastErr = new Error("bad status " + (res && res.status));
      } catch (e) { lastErr = e; }
      if (attempt < retries) await sleep(backoffMs);
    }
  }
  throw lastErr;
}
