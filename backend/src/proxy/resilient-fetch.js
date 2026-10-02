const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Public OSM services (Overpass, OSRM) refuse anonymous clients: overpass-api.de
// answers 406 to a generic User-Agent. Always identify the app and a contact.
export const USER_AGENT = "MuddyYorkFishing/1.0 (+https://muddyyorkfishing.ca; info@muddyyorkfishing.ca)";
export async function resilientFetch(urls, options = {}, opts = {}) {
  const { retries = 1, fetchImpl = fetch, backoffMs = 150, timeoutMs = 0 } = opts;
  let lastErr = new Error("no urls");
  for (const url of urls) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      let timer = null, opt = { ...options, headers: { "User-Agent": USER_AGENT, Accept: "application/json", ...(options.headers || {}) } };
      // Abort a hung host so we fail over instead of waiting forever.
      if (timeoutMs && typeof AbortController !== "undefined") {
        const ctrl = new AbortController();
        opt = { ...opt, signal: ctrl.signal };
        timer = setTimeout(() => ctrl.abort(), timeoutMs);
      }
      try {
        const res = await fetchImpl(url, opt);
        if (res && res.ok) return res;
        lastErr = new Error("bad status " + (res && res.status));
      } catch (e) { lastErr = e; }
      finally { if (timer) clearTimeout(timer); }
      if (attempt < retries) await sleep(backoffMs);
    }
  }
  throw lastErr;
}
