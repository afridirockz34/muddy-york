import { prisma } from "../db.js";
import { getCurrentUser } from "../auth/current-user.js";
import { isAdmin } from "../social/moderation.js";

// Browsers post Content Security Policy violations here (report-only for now),
// so we can see what an enforced policy would break before turning it on.
// Stored as events: ref = the blocked source, meta = directive and page.
export default async function cspReportRoutes(app) {
  app.addContentTypeParser(["application/csp-report", "application/reports+json"], { parseAs: "string" }, (req, body, done) => {
    try { done(null, JSON.parse(body || "{}")); } catch { done(null, {}); }
  });
  app.post("/api/csp-report", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
    const list = Array.isArray(req.body) ? req.body.map((r) => r && r.body) : [req.body && (req.body["csp-report"] || req.body)];
    const data = list.filter(Boolean).slice(0, 10).map((r) => {
      const blocked = String(r["blocked-uri"] || r.blockedURL || "").slice(0, 120);
      const directive = String(r["effective-directive"] || r["violated-directive"] || r.effectiveDirective || "").slice(0, 40);
      const page = String(r["document-uri"] || r.documentURL || "").replace(/^https?:\/\/[^/]+/, "").slice(0, 120);
      return { type: "csp_violation", ref: blocked || "(inline)", meta: { directive, page } };
    });
    if (data.length) await prisma.event.createMany({ data }).catch(() => {});
    return reply.code(204).send();
  });

  // Admin: what the policy would have blocked in the last 7 days.
  app.get("/api/admin/csp", async (req, reply) => {
    if (!isAdmin(await getCurrentUser(req))) return reply.code(403).send({ error: "forbidden" });
    const since = new Date(Date.now() - 7 * 864e5);
    const rows = await prisma.event.findMany({ where: { type: "csp_violation", createdAt: { gte: since } }, select: { ref: true, meta: true }, take: 5000 });
    const by = new Map();
    for (const r of rows) { const k = `${r.meta?.directive || "?"} · ${r.ref}`; by.set(k, (by.get(k) || 0) + 1); }
    return { total: rows.length, top: [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([label, count]) => ({ label, count })) };
  });
}
