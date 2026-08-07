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
};
