function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}
// Trim whitespace, strip surrounding quotes, and drop an accidental leading
// "SOMENAME=" that gets pasted into a dashboard value field by mistake.
function cleanEnv(v) {
  if (!v) return "";
  let s = String(v).trim().replace(/^['"]|['"]$/g, "").trim();
  const m = s.match(/^[A-Z0-9_]+=(.*)$/); // e.g. "CLOUDINARY_CLOUD_NAME=dabc123"
  if (m) s = m[1].trim().replace(/^['"]|['"]$/g, "").trim();
  return s;
}
export const config = {
  env: process.env.NODE_ENV || "development",
  isProd: process.env.NODE_ENV === "production",
  databaseUrl: required("DATABASE_URL"),
  cookieName: process.env.SESSION_COOKIE_NAME || "my_session",
  frontendOrigin: process.env.FRONTEND_ORIGIN || "http://localhost:8000",
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    redirectUri: process.env.GOOGLE_REDIRECT_URI || "",
  },
  apple: {
    clientId: process.env.APPLE_CLIENT_ID || "",       // Services ID, e.g. com.muddyyork.web
    teamId: process.env.APPLE_TEAM_ID || "",
    keyId: process.env.APPLE_KEY_ID || "",
    privateKey: (process.env.APPLE_PRIVATE_KEY || "").replace(/\\n/g, "\n"), // .p8 contents
    redirectUri: process.env.APPLE_REDIRECT_URI || "",
    get configured() { return !!(this.clientId && this.teamId && this.keyId && this.privateKey && this.redirectUri); },
  },
  resend: {
    apiKey: process.env.RESEND_API_KEY || "",
    from: process.env.EMAIL_FROM || "Muddy York Fishing <onboarding@resend.dev>",
    adminEmail: process.env.ADMIN_EMAIL || process.env.EMAIL_FROM || "",
    // Where membership/trial/cancel notifications are sent.
    billingEmail: process.env.BILLING_NOTIFY_EMAIL || "faheem-afridi@live.com",
    // Secret used to sign one-click unsubscribe links (HMAC).
    emailSecret: process.env.EMAIL_SECRET || process.env.STRIPE_WEBHOOK_SECRET || process.env.STRIPE_SECRET_KEY || "",
    // Public base URL where the /unsubscribe route is reachable (this backend).
    unsubBase: process.env.PUBLIC_BACKEND_URL || process.env.RENDER_EXTERNAL_URL || "",
  },
  vapid: {
    // Public key is safe to ship; private key MUST come from env (secret).
    publicKey: cleanEnv(process.env.VAPID_PUBLIC_KEY) || "BK9MFus-Mh1cSe4OgGW-ZokA1Mn3a5Ryr5NMlEEAY4UTjKqeaGSyMhYEoWCm1NUYyNyj4iQ6CuJJb-gnLIvBZso",
    privateKey: cleanEnv(process.env.VAPID_PRIVATE_KEY),
    subject: cleanEnv(process.env.VAPID_SUBJECT) || "mailto:afridirockz34@gmail.com",
    get configured() { return !!(this.publicKey && this.privateKey); },
  },
  cloudinary: {
    // Defensive: strip surrounding quotes/whitespace and an accidental "NAME="
    // prefix (a paste mistake), so a slightly-off env value still works.
    cloudName: cleanEnv(process.env.CLOUDINARY_CLOUD_NAME),
    apiKey: cleanEnv(process.env.CLOUDINARY_API_KEY),
    apiSecret: cleanEnv(process.env.CLOUDINARY_API_SECRET),
    folder: cleanEnv(process.env.CLOUDINARY_UPLOAD_FOLDER) || "muddy-york/posts",
    get configured() { return !!(this.cloudName && this.apiKey && this.apiSecret); },
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || "",
    // Publishable keys are public by design. This test-mode default lets checkout
    // work out of the box; set STRIPE_PUBLISHABLE_KEY (pk_live_…) to override at go-live.
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || "pk_test_51U2aKdB7PTqJLwEiS1enHEJjU7AuhEyG24f3qi8LEITXPrcUs58nFUmiIgEIGxmOtljNtRCqlGoCojtXdI2XeqKh00Pr9uw8KG",
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
    priceMonthly: process.env.STRIPE_PRICE_MONTHLY || "",
    priceAnnual: process.env.STRIPE_PRICE_ANNUAL || "",
    successUrl: process.env.CHECKOUT_SUCCESS_URL || "http://localhost:8000/?checkout=success",
    cancelUrl: process.env.CHECKOUT_CANCEL_URL || "http://localhost:8000/?checkout=cancel",
  },
};
