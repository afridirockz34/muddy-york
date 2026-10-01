// Email checks shared by the signup form and the backend. Bad addresses used to
// reach Stripe (customer creation fails on them), so signup rejects them up front.

export function normalizeEmail(s) {
  return String(s || "").trim().toLowerCase();
}

// Common misspellings of the big providers → the intended domain.
const TYPOS = {
  "gmial.com": "gmail.com", "gmai.com": "gmail.com", "gmal.com": "gmail.com", "gmail.co": "gmail.com",
  "gmail.con": "gmail.com", "gmail.cm": "gmail.com", "gmail.om": "gmail.com", "gamil.com": "gmail.com",
  "gnail.com": "gmail.com", "gmaill.com": "gmail.com", "gmail.ca": "gmail.com",
  "hotmial.com": "hotmail.com", "hotmai.com": "hotmail.com", "hotmail.co": "hotmail.com", "hotmail.con": "hotmail.com",
  "hotmal.com": "hotmail.com", "homail.com": "hotmail.com",
  "yahooo.com": "yahoo.com", "yaho.com": "yahoo.com", "yahoo.con": "yahoo.com", "yahoo.co": "yahoo.com",
  "outlok.com": "outlook.com", "outlook.con": "outlook.com", "outloo.com": "outlook.com",
  "iclud.com": "icloud.com", "icloud.con": "icloud.com", "icoud.com": "icloud.com",
  "live.con": "live.com", "rogers.con": "rogers.com", "sympatico.con": "sympatico.ca",
};

// "you@gmial.com" → "you@gmail.com", or null when nothing looks misspelled.
export function suggestEmail(s) {
  const e = normalizeEmail(s);
  const at = e.lastIndexOf("@");
  if (at < 1) return null;
  const fix = TYPOS[e.slice(at + 1)];
  return fix ? `${e.slice(0, at)}@${fix}` : null;
}

// Returns a human-readable problem, or null when the address is well-formed.
export function emailProblem(s) {
  const e = normalizeEmail(s);
  if (!e) return "Enter your email address.";
  if (e.length > 254) return "That email address is too long.";
  const parts = e.split("@");
  if (parts.length !== 2) return "Enter a valid email address, like name@example.com.";
  const [local, domain] = parts;
  if (!local || local.length > 64 || !/^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+$/.test(local)
      || local.startsWith(".") || local.endsWith(".") || local.includes(".."))
    return "Enter a valid email address, like name@example.com.";
  const labels = domain.split(".");
  if (labels.length < 2 || labels.some((l) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(l)))
    return "Enter a valid email address, like name@example.com.";
  if (!/^[a-z]{2,24}$/.test(labels[labels.length - 1]))
    return "Enter a valid email address, like name@example.com.";
  const fix = suggestEmail(e);
  if (fix) return `Check the spelling — did you mean ${fix}?`;
  return null;
}
