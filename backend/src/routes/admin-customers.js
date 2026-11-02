import { getCurrentUser } from "../auth/current-user.js";
import { isAdmin } from "../social/moderation.js";
import { customerProfiles, interestText } from "../customers/profile.js";
import { buildXlsx } from "../customers/xlsx.js";
import { prisma } from "../db.js";
import { enabled as mailerliteOn, syncAll, GROUP_NAME } from "../mailerlite/sync.js";

const PLAN_FILTERS = new Set(["free", "trial", "monthly", "yearly", "gift"]);

function whereFor(q) {
  const s = String(q || "").trim();
  return s ? { OR: [{ email: { contains: s, mode: "insensitive" } }, { displayName: { contains: s, mode: "insensitive" } }] } : {};
}

const day = (iso) => (iso ? iso.slice(0, 10) : "");

// Every customer, newest first, for the admin "See all" list and the export.
export default async function adminCustomerRoutes(app) {
  const guard = async (req, reply) => {
    const me = await getCurrentUser(req);
    if (!isAdmin(me)) { reply.code(403).send({ error: "forbidden" }); return false; }
    return true;
  };

  app.get("/api/admin/customers", async (req, reply) => {
    if (!(await guard(req, reply))) return;
    const { q, plan } = req.query || {};
    const limit = Math.min(200, Math.max(1, Number(req.query?.limit) || 50));
    const offset = Math.max(0, Number(req.query?.offset) || 0);
    const where = whereFor(q);
    // Plan depends on Stripe status and dates, so filter after building rows.
    if (plan && PLAN_FILTERS.has(plan)) {
      const all = (await customerProfiles({ where })).filter((p) => p.plan === plan);
      return { total: all.length, rows: all.slice(offset, offset + limit) };
    }
    const [total, rows] = await Promise.all([prisma.user.count({ where }), customerProfiles({ where, take: limit, skip: offset })]);
    return { total, rows };
  });

  app.get("/api/admin/customers/export.xlsx", async (req, reply) => {
    if (!(await guard(req, reply))) return;
    const plan = req.query?.plan;
    const rows = (await customerProfiles({ where: whereFor(req.query?.q) })).filter((p) => !PLAN_FILTERS.has(plan) || p.plan === plan);
    const columns = [
      { header: "Email", width: 32 }, { header: "Username", width: 20 }, { header: "Subscription", width: 20 },
      { header: "Registered", width: 12 }, { header: "Device", width: 30 }, { header: "Acquisition", width: 14 },
      { header: "Campaign", width: 22 }, { header: "Landing page", width: 34 }, { header: "Most viewed river", width: 22 },
      { header: "First river seen", width: 22 }, { header: "Saved rivers", width: 30 }, { header: "Interest", width: 60 },
      { header: "Sign-in", width: 9 }, { header: "Emails", width: 14 }, { header: "Last active", width: 12 },
    ];
    const data = rows.map((p) => [
      p.email, p.username, p.planLabel, day(p.registered), p.device || p.lastDevice, p.source || "Unknown",
      p.utmCampaign, p.landing, p.topRiver, p.firstRiver, p.savedRivers.join(", "), interestText(p),
      p.signIn, p.emailOptOut ? "Unsubscribed" : "Subscribed", day(p.lastActive),
    ]);
    const stamp = new Date().toISOString().slice(0, 10);
    reply.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    reply.header("Content-Disposition", `attachment; filename="muddy-york-customers-${stamp}.xlsx"`);
    reply.header("Cache-Control", "no-store");
    return reply.send(buildXlsx({ sheet: "Customers", columns, rows: data }));
  });

  app.get("/api/admin/mailerlite", async (req, reply) => {
    if (!(await guard(req, reply))) return;
    return { connected: mailerliteOn(), group: GROUP_NAME() };
  });

  app.post("/api/admin/mailerlite/sync", async (req, reply) => {
    if (!(await guard(req, reply))) return;
    if (!mailerliteOn()) return reply.code(400).send({ error: "MailerLite isn't connected. Add MAILERLITE_API_KEY on Render." });
    try { return await syncAll({ log: req.log }); }
    catch (e) { return reply.code(502).send({ error: e.message }); }
  });
}
