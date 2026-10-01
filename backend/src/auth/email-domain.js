import { promises as dns } from "node:dns";

// Does the email's domain accept mail? True when it has MX records (or, per the
// mail RFCs, an address record to fall back to). A domain that plainly doesn't
// exist is false. DNS trouble on our side (timeouts, resolver errors) is treated
// as true — a flaky lookup must never block a real customer from signing up.
export async function domainAcceptsMail(email, { resolver = dns, timeoutMs = 3000 } = {}) {
  const domain = String(email || "").split("@")[1];
  if (!domain) return false;
  const lookup = async () => {
    try {
      const mx = await resolver.resolveMx(domain);
      if (Array.isArray(mx) && mx.some((r) => r && r.exchange && r.exchange !== ".")) return true;
    } catch (e) {
      if (!isMissing(e)) return true;
    }
    try {
      const a = await resolver.resolve4(domain);
      return Array.isArray(a) && a.length > 0;
    } catch (e) {
      return !isMissing(e);
    }
  };
  const timeout = new Promise((ok) => setTimeout(() => ok(true), timeoutMs));
  return Promise.race([lookup(), timeout]);
}

const isMissing = (e) => e && (e.code === "ENOTFOUND" || e.code === "ENODATA" || e.code === "NXDOMAIN");
