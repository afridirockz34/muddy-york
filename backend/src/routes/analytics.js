import { prisma } from "../db.js";
import { getCurrentUser } from "../auth/current-user.js";
import { isAdmin } from "../social/moderation.js";

const TZ = "America/Toronto";
const num = (v) => Number(v || 0);

// Admin-only analytics for the website and the app, from our own event log.
// Visitors are counted by the anonymous visitorId both share; sessions end
// after 30 idle minutes.
export default async function analyticsRoutes(app) {
  app.get("/api/admin/analytics", async (req, reply) => {
    const me = await getCurrentUser(req);
    if (!isAdmin(me)) return reply.code(403).send({ error: "forbidden" });
    const days = Math.min(90, Math.max(1, parseInt(req.query?.days, 10) || 7));
    const since = new Date(Date.now() - days * 86400000);
    const live = new Date(Date.now() - 5 * 60000);
    const top = (rows, n = 12) => rows.map((r) => ({ label: r.label ?? "(none)", count: num(r.count), ...(r.extra || {}) })).slice(0, n);

    const [
      totals, daily, pages, leave, clicks, screens, sources, devices, funnelRows, liveNow, sessions,
    ] = await Promise.all([
      prisma.$queryRaw`SELECT COUNT(DISTINCT "visitorId") AS visitors, COUNT(DISTINCT "sessionId") AS sessions,
          COUNT(*) FILTER (WHERE type = 'pageview') AS pageviews, COUNT(*) FILTER (WHERE type = 'screen') AS screens,
          COUNT(DISTINCT "userId") FILTER (WHERE "userId" IS NOT NULL) AS members
        FROM "Event" WHERE "createdAt" >= ${since}`,
      prisma.$queryRaw`SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${TZ}, 'YYYY-MM-DD') AS day,
          COUNT(DISTINCT "visitorId") AS visitors, COUNT(*) FILTER (WHERE type = 'pageview') AS pageviews
        FROM "Event" WHERE "createdAt" >= ${since} GROUP BY 1 ORDER BY 1`,
      prisma.$queryRaw`SELECT ref AS label, COUNT(*) AS count, COUNT(DISTINCT "visitorId") AS visitors
        FROM "Event" WHERE type = 'pageview' AND "createdAt" >= ${since} GROUP BY ref ORDER BY count DESC LIMIT 25`,
      prisma.$queryRaw`SELECT ref AS label, ROUND(AVG((meta->>'secs')::numeric)) AS secs, ROUND(AVG((meta->>'scroll')::numeric)) AS scroll
        FROM "Event" WHERE type = 'page_leave' AND "createdAt" >= ${since} AND meta ? 'secs' GROUP BY ref`,
      prisma.$queryRaw`SELECT ref AS label, COUNT(*) AS count FROM "Event"
        WHERE type = 'click' AND "createdAt" >= ${since} GROUP BY ref ORDER BY count DESC LIMIT 25`,
      prisma.$queryRaw`SELECT ref AS label, COUNT(*) AS count, COUNT(DISTINCT "visitorId") AS visitors FROM "Event"
        WHERE type = 'screen' AND "createdAt" >= ${since} GROUP BY ref ORDER BY count DESC LIMIT 20`,
      prisma.$queryRaw`SELECT ref AS label, COUNT(*) AS count FROM "Event"
        WHERE type = 'visit' AND "createdAt" >= ${since} GROUP BY ref ORDER BY count DESC LIMIT 15`,
      prisma.$queryRaw`SELECT COALESCE(meta->>'type','?') || ' · ' || COALESCE(meta->>'os','?') AS label, COUNT(*) AS count FROM "Event"
        WHERE type = 'session_start' AND "createdAt" >= ${since} GROUP BY 1 ORDER BY count DESC LIMIT 10`,
      // Funnel: distinct visitors reaching each step in the window.
      prisma.$queryRaw`SELECT
          COUNT(DISTINCT "visitorId") AS visited,
          COUNT(DISTINCT "visitorId") FILTER (WHERE type = 'screen') AS opened_app,
          (SELECT COUNT(*) FROM "User" WHERE "createdAt" >= ${since}) AS signed_up,
          COUNT(DISTINCT "visitorId") FILTER (WHERE type = 'checkout_open') AS opened_checkout,
          COUNT(DISTINCT "userId") FILTER (WHERE type = 'terms_accepted') AS started_trial
        FROM "Event" WHERE "createdAt" >= ${since}`,
      prisma.$queryRaw`SELECT COUNT(DISTINCT "visitorId") AS n FROM "Event" WHERE "createdAt" >= ${live}`,
      prisma.$queryRaw`SELECT "sessionId" AS id, MIN("createdAt") AS started, MAX("createdAt") AS ended, COUNT(*) AS events,
          COUNT(*) FILTER (WHERE type IN ('pageview','screen')) AS views,
          MAX("userId") AS "userId", MAX(CASE WHEN type = 'session_start' THEN meta->>'source' END) AS source,
          MAX(CASE WHEN type = 'session_start' THEN COALESCE(meta->>'type','') || ' ' || COALESCE(meta->>'os','') END) AS device,
          (ARRAY_AGG(ref ORDER BY "createdAt") FILTER (WHERE type IN ('pageview','screen')))[1] AS entry
        FROM "Event" WHERE "sessionId" IS NOT NULL AND "createdAt" >= ${since}
        GROUP BY "sessionId" ORDER BY MAX("createdAt") DESC LIMIT 40`,
    ]);

    const t = totals[0] || {};
    const leaveBy = Object.fromEntries(leave.map((r) => [r.label, { secs: num(r.secs), scroll: num(r.scroll) }]));
    const userIds = [...new Set(sessions.map((s) => s.userId).filter(Boolean))];
    const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true } }) : [];
    const emailOf = Object.fromEntries(users.map((u) => [u.id, u.email]));
    const f = funnelRows[0] || {};
    const paid = await prisma.subscription.count({ where: { status: "active" } }).catch(() => 0);

    return {
      days,
      liveNow: num(liveNow[0]?.n),
      totals: {
        visitors: num(t.visitors), sessions: num(t.sessions), pageviews: num(t.pageviews), screens: num(t.screens),
        members: num(t.members),
        viewsPerSession: t.sessions ? +((num(t.pageviews) + num(t.screens)) / num(t.sessions)).toFixed(1) : 0,
      },
      daily: daily.map((d) => ({ day: d.day, visitors: num(d.visitors), pageviews: num(d.pageviews) })),
      pages: pages.map((p) => ({ label: p.label, count: num(p.count), visitors: num(p.visitors), ...(leaveBy[p.label] || {}) })),
      clicks: top(clicks, 25),
      screens: screens.map((s) => ({ label: s.label, count: num(s.count), visitors: num(s.visitors) })),
      sources: top(sources, 15),
      devices: top(devices, 10),
      funnel: [
        { step: "Visited", count: num(f.visited) },
        { step: "Opened the app", count: num(f.opened_app) },
        { step: "Created an account", count: num(f.signed_up) },
        { step: "Opened checkout", count: num(f.opened_checkout) },
        { step: "Started a trial", count: num(f.started_trial) },
        { step: "Paying members (all time)", count: paid },
      ],
      sessions: sessions.map((s) => ({
        id: s.id, started: new Date(s.started).toISOString(), ended: new Date(s.ended).toISOString(),
        events: num(s.events), views: num(s.views), entry: s.entry || null, source: s.source || null,
        device: (s.device || "").trim() || null, email: s.userId ? emailOf[s.userId] || null : null,
      })),
    };
  });

  // Everything one session did, in order: the visitor's journey.
  app.get("/api/admin/analytics/session/:id", async (req, reply) => {
    const me = await getCurrentUser(req);
    if (!isAdmin(me)) return reply.code(403).send({ error: "forbidden" });
    const rows = await prisma.event.findMany({ where: { sessionId: String(req.params.id).slice(0, 40) }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 400 });
    return { events: rows.map((e) => ({ type: e.type, ref: e.ref, meta: e.meta, at: e.createdAt.toISOString() })) };
  });
}
