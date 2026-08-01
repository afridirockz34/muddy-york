# Muddy York — News aggregator (deploy once)

The app's **News** tab shows a live conditions feed on its own (rain on the way,
flows up/down, prime windows, warm-water warnings) with no setup. To also pull
**external reports, events, and regulation notices**, deploy this small worker and
paste its URL into the app — browsers can't fetch those RSS/Atom feeds directly
(CORS), so a tiny server does it for you.

## What it does
`news-worker.js` fetches the RSS/Atom feeds you list, classifies each item
(Weather / Water / Reports / Events / Regulations), dedupes, sorts newest-first,
caches for 30 minutes, and serves JSON at `GET /news` with an open CORS header.

## Deploy on Cloudflare Workers (free tier is plenty)
1. Install Wrangler: `npm i -g wrangler` then `wrangler login`.
2. In this `server/` folder, create `wrangler.toml`:
   ```toml
   name = "muddy-york-news"
   main = "news-worker.js"
   compatibility_date = "2024-11-01"
   ```
3. Edit the `FEEDS` array in `news-worker.js` — confirm/replace the example URLs
   with the conservation authorities, clubs, and government feeds you want.
   (Authority and government feed URLs change; verify each one in a browser.)
4. `wrangler deploy`. You'll get a URL like
   `https://muddy-york-news.<you>.workers.dev`.
5. In the app: **News tab → Connect a source →** paste
   `https://muddy-york-news.<you>.workers.dev/news` → Save.

Vercel/Netlify functions work too — same idea: fetch feeds server-side, return
the JSON contract below with `Access-Control-Allow-Origin: *`.

## JSON contract the app expects
An array (or `{ items: [...] }`) of:
```json
{
  "title": "Stocking update — Credit River",
  "summary": "Short plain-text summary…",
  "category": "Reports",          // Weather | Water | Reports | Events | Regulations
  "source": "Credit Valley CA",
  "url": "https://…",
  "published": "2026-06-18T12:00:00Z"
}
```

## Notes
- Keep the feed list short and reputable; the worker caps output at 60 items.
- Respect each source's terms; cache TTL is set to be polite (30 min).
- Nothing here is required for the app to run — it only enriches the News tab.

---

## Option B — Netlify (instead of Cloudflare)

Files: `netlify/functions/news.mjs` + `netlify.toml` + `public/index.html` (this
`server/` folder is already structured as a tiny functions-only Netlify site).

Browser drag-and-drop won't bundle functions, so deploy this one with the CLI:

1. `npm i -g netlify-cli`
2. From this `server/` folder: `netlify deploy --prod`
   (it'll prompt to create/link a site; publish dir is `public`, functions are
   auto-detected in `netlify/functions`).
3. Your endpoint is `https://<your-site>.netlify.app/news` (the function declares
   `config.path = "/news"`).
4. In the app: **News ▸ Connect a source ▸** paste that `/news` URL ▸ Save.

Edit the `FEEDS` array in `news.mjs` first to set the sources you want. Your main
app can stay on Netlify Drop — this is a separate little site just for the feed.
