# Account & Credential Setup — What You Need to Provide

This is the external stuff the backend needs that only you can create. Everything
goes into `backend/.env` (git-ignored — never commit it, never paste secrets into
chat). Items are grouped by when they're needed.

**Secret safety:** it's fine to share a *Postgres connection string* if we build
together, but never paste a **Google client secret**, **Stripe secret key**, or
**email API key** into chat — put those straight into `backend/.env` yourself.

---

## NEEDED FOR PHASE 1 (backend + auth)

### 1. PostgreSQL database → `DATABASE_URL`

Pick ONE:

**Option A — Local with Docker (fastest if you have Docker):**
```bash
docker run --name muddy-pg -e POSTGRES_PASSWORD=pass -e POSTGRES_DB=muddyyork -p 5432:5432 -d postgres:16
```
Then:
```
DATABASE_URL=postgresql://postgres:pass@localhost:5432/muddyyork
```

**Option B — Free hosted (Neon, no Docker needed):**
1. Go to https://neon.tech and sign up (GitHub or Google).
2. Click **Create project** — it creates a database automatically.
3. On the project dashboard, find **Connection string** and copy it (it includes
   the password and ends with `?sslmode=require`).
4. Paste it as `DATABASE_URL` in `backend/.env`.

### 2. Google OAuth client → `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`

1. Go to https://console.cloud.google.com and sign in.
2. Top bar → **Select a project** → **New Project** → name it (e.g. "Muddy York")
   → Create, then select it.
3. Left menu → **APIs & Services → OAuth consent screen**:
   - User type: **External** → Create.
   - App name, your support email, developer email → Save and continue.
   - Scopes: add **`openid`** and **`.../auth/userinfo.email`** → Save.
   - Test users: **add your own Google email** (while the app is in "Testing").
4. Left menu → **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**.
   - **Authorized redirect URIs** → Add: `http://localhost:3000/auth/google/callback`
   - Create.
5. Copy the **Client ID** and **Client secret** shown.
6. In `backend/.env`:
   ```
   GOOGLE_CLIENT_ID=<the client id>
   GOOGLE_CLIENT_SECRET=<the client secret>
   GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
   ```
   (Later, for production, add a second redirect URI: `https://<your-render-url>/auth/google/callback`.)

**Also make sure you have Node 20+ installed** (you already do). Docker is only
needed for Postgres Option A.

---

## NEEDED SOON (prepare while paused)

### 3. Stripe (Phase 2 — payments)
1. Sign up at https://stripe.com. You can use **Test mode** immediately (toggle
   top-right) without full account activation.
2. **Products** → **Add product** twice:
   - "Muddy York — Monthly", recurring **$9.99 / month**.
   - "Muddy York — Annual", recurring **$59.99 / year**.
   Copy each **Price ID** (looks like `price_...`).
3. **Developers → API keys** (in Test mode): copy the **Secret key** (`sk_test_...`)
   and **Publishable key** (`pk_test_...`).
4. Webhook secret (`whsec_...`) comes later — for local testing we'll use the
   Stripe CLI (`stripe listen`), which prints one.
   ```
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_PUBLISHABLE_KEY=pk_test_...
   STRIPE_PRICE_MONTHLY=price_...
   STRIPE_PRICE_ANNUAL=price_...
   STRIPE_WEBHOOK_SECRET=whsec_...   # filled in during Phase 2
   ```

### 4. Email provider — Resend (Phase 5 alerts + email verification)
1. Sign up at https://resend.com.
2. For development you can send from their onboarding/test domain; for production,
   **Add domain** and follow the DNS steps to verify your sending domain.
3. **API Keys → Create API Key** → copy it.
   ```
   RESEND_API_KEY=re_...
   EMAIL_FROM="Muddy York <noreply@yourdomain.com>"
   ```

### 5. Render (hosting — when we deploy the backend)
1. Sign up at https://render.com and **connect your GitHub**.
2. Nothing to create yet — during deploy we'll add a **Web Service** (the backend)
   and a **Render Postgres** (or keep Neon), and copy the same env vars above into
   Render's dashboard.

### 6. Water Survey of Canada (Phase 4 — measured conditions)
Open government data — **no account or key required**. Nothing to do now.

---

## Summary — `backend/.env` you'll assemble

```
# Phase 1
DATABASE_URL=postgresql://...
SESSION_COOKIE_NAME=my_session
FRONTEND_ORIGIN=http://localhost:8000
NODE_ENV=development
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback

# Phase 2 (Stripe)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_PRICE_MONTHLY=price_...
STRIPE_PRICE_ANNUAL=price_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Phase 5 (email)
RESEND_API_KEY=re_...
EMAIL_FROM="Muddy York <noreply@yourdomain.com>"
```

## When you're ready
Get at least items **1 (Postgres)** and **2 (Google)** for Phase 1. Then say the
word and I'll build the backend; you'll paste those two into `backend/.env` and we
run the tests together. Stripe/email/Render can be gathered in parallel for the
later phases.
