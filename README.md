# Muddy York Angling Co. — install on your iPhone

A self-contained heritage Progressive Web App for Southern Ontario trout & salmon. Everything runs on your phone; the only
network call is the weather request. Your river database, last weather pull,
saved location, and analysis log live in the app's own on-device storage.

## What's in this folder
- `index.html` — the app shell
- `app.js` — the whole app, React bundled in (no internet needed to load)
- `manifest.webmanifest` — makes it installable
- `sw.js` — service worker, lets it launch offline
- `icons/` — app icons

A PWA must be served over **HTTPS** — opening `index.html` directly from Files
won't work (service workers and "Add to Home Screen" need a real https URL).
Pick one host below, then install.

## Step 1 — Put it online (any one of these)

**Netlify Drop (easiest, no account needed to start)**
1. On a computer, go to https://app.netlify.com/drop
2. Drag the whole `river-intel-pwa` folder onto the page.
3. It gives you an `https://…netlify.app` link. Open that on your iPhone.

**GitHub Pages (free, permanent)**
1. Create a repo, upload these files to it.
2. Settings ▸ Pages ▸ Deploy from branch ▸ `main` / root.
3. Your link is `https://<you>.github.io/<repo>/`.

**Vercel** also works — import the folder/repo, deploy, open the link.

## Step 2 — Add to Home Screen (iOS 26)
1. Open your https link in **Safari** (not Chrome — only Safari can install on iOS).
2. Tap the **Share** button → **Add to Home Screen** → **Add**.
3. Launch it from the new icon. It opens fullscreen, like a native app.

## Step 3 — Allow location
Tap **Use my location** inside the app the first time. iOS will ask for
permission. This finds your nearest river sections and shows the weather where
you are. If you ever blocked it: Settings ▸ Safari ▸ Location (or the app's own
entry under Settings) ▸ Allow.

## Notes
- **Keep it installed.** iOS may clear a site's stored data after long disuse,
  but installing it to the Home Screen (and the app's persistent-storage request)
  protects your saved data.
- **Updates:** to push a new version, replace `app.js` on your host and bump
  `CACHE = "muddy-york-v1"` to `v2` in `sw.js` so the app fetches the new files.
- **Offline:** it launches and shows your last-known readings without signal;
  reconnect and tap Refresh for current weather.
- Always confirm seasons and sanctuary closures in the current Ontario Fishing
  Regulations Summary (FMZ 16/17, and 13/14 for Georgian Bay) before fishing.

## V2 tabs
Map (interactive, parking & routes), Report (today's ranked water + advisor),
Rivers (full database), News (live conditions feed + optional external sources via
`server/`), Saved (your spots + logbook), Notes (method & regulations). The News
tab's external sources are optional — see `server/README.md`.
