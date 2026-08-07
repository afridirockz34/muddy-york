// Load backend/.env into process.env before any test module (which imports
// config.js) evaluates. Node 20.12+/22+ provides process.loadEnvFile.
try {
  process.loadEnvFile();
} catch {
  // no .env present (e.g. CI with env vars already set) — ignore
}
