function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
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
  resend: {
    apiKey: process.env.RESEND_API_KEY || "",
    from: process.env.EMAIL_FROM || "Muddy York <onboarding@resend.dev>",
    adminEmail: process.env.ADMIN_EMAIL || process.env.EMAIL_FROM || "",
  },
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || "",
    apiKey: process.env.CLOUDINARY_API_KEY || "",
    apiSecret: process.env.CLOUDINARY_API_SECRET || "",
    folder: process.env.CLOUDINARY_UPLOAD_FOLDER || "muddy-york/posts",
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
