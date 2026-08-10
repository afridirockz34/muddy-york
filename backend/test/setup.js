// Load backend/.env into process.env before any test module (which imports
// config.js) evaluates. Node 20.12+/22+ provides process.loadEnvFile.
try {
  process.loadEnvFile();
} catch {
  // no .env present (e.g. CI with env vars already set) — ignore
}

// SAFETY: the suite wipes tables (resetDb). It must NEVER run against the real
// database. Tests use a dedicated throwaway DB via TEST_DATABASE_URL; without
// it, point DATABASE_URL at an unreachable host so DB-backed tests fail loudly
// instead of deleting production data. (Pure-logic tests still run.)
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  "postgresql://blocked:blocked@127.0.0.1:1/no_test_db_configured";
