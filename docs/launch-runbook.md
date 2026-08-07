# Launch Runbook — What's Left, Step by Step

Everything is built and tested. What remains needs *your* accounts. Do Part 1
(local, ~30 min) first to prove payments + email work, then Part 2 to go live.

Your local paths:
- Backend: `cd /Users/faheemafridi/river-intel-pwa/backend`
- Frontend: `cd /Users/faheemafridi/river-intel-pwa`
- Secrets live in `backend/.env` (git-ignored — never commit it).

---

## PART 1 — Verify locally (do this first)

### A. Stripe test checkout

1. Go to https://stripe.com, sign in, and flip the top-right toggle to **Test mode**.
2. **Products → Add product** (do this twice):
   - "Muddy York — Monthly": Recurring price **$9.99 / month** → Save → copy the **Price ID** (`price_…`).
   - "Muddy York — Annual": Recurring price **$59.99 / year** → Save → copy its **Price ID**.
3. **Developers → API keys** → copy the **Secret key** (`sk_test_…`).
4. Open `backend/.env` and fill these lines:
   ```
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_PRICE_MONTHLY=price_...   (the monthly one)
   STRIPE_PRICE_ANNUAL=price_...    (the annual one)
   ```
5. Install the Stripe CLI and start forwarding webhooks (so a completed checkout
   updates the subscription):
   ```bash
   brew install stripe/stripe-cli/stripe
   stripe login
   stripe listen --forward-to localhost:3000/webhooks/stripe
   ```
   It prints a signing secret `whsec_…`. Put it in `backend/.env`:
   ```
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```
   Leave `stripe listen` running in that terminal.
6. In a **second** terminal, start the backend:
   ```bash
   cd /Users/faheemafridi/river-intel-pwa/backend && npm run dev
   ```
7. In a **third** terminal, serve the app pointed at the backend (see
   "Pointing the app at the backend" at the bottom), then open
   http://localhost:8000, click **Sign in → create an account**, then in the
   account panel click **Go annual** or **Monthly**.
8. You'll land on Stripe Checkout. Use test card **4242 4242 4242 4242**, any
   future expiry, any CVC/ZIP. Complete it. Back in the app, reopen the account
   panel — your badge should read **Member** (the webhook synced it).

✅ Payments work.

### B. Resend email alert

1. Go to https://resend.com, sign up. You can send to *your own* signup email
   from their test sender without verifying a domain.
2. **API Keys → Create API Key** → copy it (`re_…`).
3. In `backend/.env`:
   ```
   RESEND_API_KEY=re_...
   EMAIL_FROM=Muddy York <onboarding@resend.dev>
   ```
4. Restart the backend (Ctrl+C in its terminal, then `npm run dev`).
5. In the app, sign up (or sign in) **with your real email**, save a cold
   tailwater (e.g. Grand River tailwater), and in the account panel set the
   **alert threshold low** (e.g. 50) so it triggers.
6. Run the alert job:
   ```bash
   cd /Users/faheemafridi/river-intel-pwa/backend && npm run alerts:run
   ```
   It prints `alerts: { evaluated: N, sent: 1 }` and you get an email.

✅ Alerts work.

---

## PART 2 — Go live

### C. Deploy the backend to Render

1. Go to https://render.com, sign up, connect your GitHub.
2. **New → Web Service** → pick the `muddy-york` repo.
3. Settings:
   - **Root Directory:** `backend`
   - **Build Command:** `npm install && npx prisma generate && npx prisma db push`
   - **Start Command:** `npm start`
   - Instance type: Free is fine to start.
4. **Environment → add these variables** (copy the real values from your
   `backend/.env`, plus the production-specific ones):
   ```
   NODE_ENV=production
   DATABASE_URL=          (your Neon string — reuse it)
   SESSION_COOKIE_NAME=my_session
   FRONTEND_ORIGIN=       (your Netlify URL — set after Part E, then redeploy)
   GOOGLE_CLIENT_ID=
   GOOGLE_CLIENT_SECRET=
   GOOGLE_REDIRECT_URI=   https://YOUR-RENDER-APP.onrender.com/auth/google/callback
   STRIPE_SECRET_KEY=
   STRIPE_PRICE_MONTHLY=
   STRIPE_PRICE_ANNUAL=
   STRIPE_WEBHOOK_SECRET= (set in step D3)
   RESEND_API_KEY=
   EMAIL_FROM=Muddy York <onboarding@resend.dev>
   ```
5. Create the service. When it's live, note its URL, e.g.
   `https://muddy-york-api.onrender.com`.

### D. Production settings for Google + Stripe

1. **Google OAuth:** in Google Cloud Console → Credentials → your OAuth client →
   **Authorized redirect URIs → Add**:
   `https://YOUR-RENDER-APP.onrender.com/auth/google/callback` → Save.
2. **Stripe webhook (production):** Stripe Dashboard (Test mode) → **Developers →
   Webhooks → Add endpoint** → URL
   `https://YOUR-RENDER-APP.onrender.com/webhooks/stripe` → select events
   `checkout.session.completed`, `customer.subscription.updated`,
   `customer.subscription.deleted` → Add.
3. Copy that endpoint's **Signing secret** (`whsec_…`) → put it in Render's
   `STRIPE_WEBHOOK_SECRET` env var → save (Render redeploys).

### E. Deploy the frontend (Netlify)

1. Point the app at your backend: edit `index.html` and add this line **just
   before** `<script src="./app.js" defer></script>`:
   ```html
   <script>window.MUDDY_API_BASE="https://YOUR-RENDER-APP.onrender.com";</script>
   ```
   Commit and push.
2. Go to https://netlify.com → **Add new site → Import from GitHub** → pick
   `muddy-york`.
   - **Build command:** `npm run build`
   - **Publish directory:** `.` (the repo root)
3. Deploy. Note your Netlify URL, e.g. `https://muddy-york.netlify.app`.
4. Go back to **Render → your service → Environment** and set
   `FRONTEND_ORIGIN=https://muddy-york.netlify.app` → save (redeploys). This is
   required for sign-in to work cross-site.
5. Open your Netlify URL, sign up, and confirm: Google + email sign-in, the
   paywall, a real checkout, and (from your phone) "Add to Home Screen" installs
   the PWA.

✅ Live.

---

## PART 3 — Housekeeping (after launch)

- **Rotate your Google client secret** (it passed through chat earlier): Google
  Cloud Console → Credentials → your client → reset secret → update it in
  Render + `backend/.env`.
- **Schedule alerts:** add a **Render Cron Job** (New → Cron Job, same repo,
  Root `backend`, Command `npm run alerts:run`, schedule e.g. `0 * * * *` for
  hourly). Optional — do it once you have subscribers.
- **Switch Stripe to live mode** when ready to charge real cards: repeat the
  product/price/keys steps in Live mode and swap the keys.

---

## Pointing the app at the backend (local testing)

The app reads `window.MUDDY_API_BASE`. For **local** testing, temporarily add
this in `index.html` before the app.js script (and remove it, or change it to
your Render URL, before deploying):
```html
<script>window.MUDDY_API_BASE="http://localhost:3000";</script>
```
Then serve the app:
```bash
cd /Users/faheemafridi/river-intel-pwa && python3 -m http.server 8000
```
Open http://localhost:8000. (Without this line, the app runs in standalone mode
with no accounts — which is the intended fallback.)
