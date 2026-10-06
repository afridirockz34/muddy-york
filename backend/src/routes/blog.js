import { createHash } from "node:crypto";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { getCurrentUser } from "../auth/current-user.js";
import { isAdmin } from "../social/moderation.js";
import { cloudinarySignature } from "../../../lib/cloudinary-sign.js";
import { renderMarkdown, markdownText } from "../../../lib/markdown.js";
import { page, esc, SITE_URL, BRAND, APP_URL } from "../../../lib/site-shell.js";

// Public blog (server-rendered HTML for search engines) at /blog, served on
// muddyyorkfishing.ca through the Netlify proxy, plus the admin API that
// writes it.

const PER_PAGE = 12;
const sha1 = (s) => createHash("sha1").update(s).digest("hex");
const postUrl = (p) => `${SITE_URL}/blog/${p.slug}/`;
export const slugify = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
// Serve Cloudinary covers resized and in the best format for the browser.
const img = (url, w) => (url && url.includes("/image/upload/") ? url.replace("/image/upload/", `/image/upload/f_auto,q_auto,c_limit,w_${w}/`) : url);
// Social cards and structured data need an absolute image URL.
const abs = (url) => (url && url.startsWith("/") ? SITE_URL + url : url);
const fmtDate = (d) => new Date(d).toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric", timeZone: "America/Toronto" });
const readMins = (md) => Math.max(1, Math.round(markdownText(md).split(" ").length / 220));
const descOf = (p) => (p.excerpt || markdownText(p.body)).slice(0, 158);

const BLOG_CSS = `<style>
.blog-head{background:var(--pine);color:#EFE9DB;padding:46px 0 38px;}
.blog-head h1{color:#fff;font-size:38px;font-weight:800;}
.blog-head p{color:#CBD8C9;font-size:17px;margin-top:10px;max-width:640px;}
.posts{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:20px;margin:34px 0 10px;}
.post-card{display:flex;flex-direction:column;background:#fff;border:1px solid var(--line);border-radius:14px;overflow:hidden;text-decoration:none;color:var(--text);}
.post-card .cover{aspect-ratio:16/9;background:var(--panel);overflow:hidden;}
.post-card .cover img{width:100%;height:100%;object-fit:cover;display:block;}
.post-card .txt{padding:16px 18px 18px;}
.post-card h2{font-size:19px;margin:6px 0 8px;}
.post-card p{color:var(--dim);font-size:14.5px;}
.post-meta{font-size:13px;color:var(--dim);}
.pager{display:flex;justify-content:space-between;margin:10px 0 40px;}
.article{max-width:760px;margin:0 auto;padding-bottom:20px;}
.article h1{font-size:36px;margin:14px 0 8px;}
.article .hero-img{margin:22px 0 6px;border-radius:14px;overflow:hidden;background:var(--panel);}
.article .hero-img img{width:100%;display:block;}
.article .body{font-size:17px;line-height:1.75;}
.article .body h2{font-size:25px;margin:32px 0 10px;}
.article .body h3{font-size:20px;margin:24px 0 8px;}
.article .body p{margin:14px 0;}
.article .body ul,.article .body ol{margin:12px 0 12px 24px;}
.article .body li{margin:5px 0;}
.article .body img{border-radius:10px;margin:14px 0;}
.article .body blockquote{border-left:3px solid var(--gold);padding:4px 0 4px 16px;margin:18px 0;color:var(--dim);font-style:italic;}
.article .body hr{border:none;border-top:1px solid var(--line);margin:28px 0;}
.article .body table{border-collapse:collapse;width:100%;min-width:420px;margin:16px 0;font-size:15px;}
.article .body th,.article .body td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);}
.article .body th{color:var(--pine);font-family:"Playfair Display",Georgia,serif;}
.article .body blockquote a{font-weight:700;}
.preview-bar{background:var(--brick);color:#fff;text-align:center;padding:9px;font-weight:700;font-size:14px;}
@media(max-width:820px){.blog-head h1,.article h1{font-size:30px;}}
</style>`;

function card(p) {
  return `<a class="post-card" href="/blog/${esc(p.slug)}/">
  <div class="cover">${p.coverUrl ? `<img src="${esc(img(p.coverUrl, 640))}" alt="${esc(p.coverAlt || p.title)}" loading="lazy"/>` : ""}</div>
  <div class="txt"><div class="post-meta">${fmtDate(p.publishedAt)}</div><h2>${esc(p.title)}</h2><p>${esc(descOf(p))}</p></div>
</a>`;
}

function indexHtml(posts, pageNo, hasNext) {
  const canonical = `${SITE_URL}/blog/${pageNo > 1 ? `?page=${pageNo}` : ""}`;
  const body = `<section class="blog-head"><div class="wrap"><h1>The ${esc(BRAND)} blog</h1>
  <p>Fishing reports, technique guides and river know-how for Southern Ontario trout, steelhead and salmon.</p></div></section>
<div class="wrap">
  ${posts.length ? `<div class="posts">${posts.map(card).join("")}</div>` : `<p style="margin:40px 0;color:var(--dim)">New posts are on the way. Check back soon.</p>`}
  <div class="pager">${pageNo > 1 ? `<a href="/blog/${pageNo > 2 ? `?page=${pageNo - 1}` : ""}">← Newer posts</a>` : "<span></span>"}${hasNext ? `<a href="/blog/?page=${pageNo + 1}">Older posts →</a>` : ""}</div>
</div>`;
  return page({
    title: `Ontario Fishing Blog: Reports & Guides | ${BRAND}`,
    description: "Fishing reports, technique guides and river know-how for Southern Ontario trout, steelhead and salmon anglers.",
    canonical, body, extraHead: `${BLOG_CSS}\n<link rel="alternate" type="application/rss+xml" title="${esc(BRAND)} blog" href="${SITE_URL}/blog/feed.xml"/>`,
    schema: { "@context": "https://schema.org", "@type": "Blog", name: `${BRAND} blog`, url: `${SITE_URL}/blog/`,
      blogPost: posts.map((p) => ({ "@type": "BlogPosting", headline: p.title, url: postUrl(p), datePublished: p.publishedAt })) },
  });
}

function postHtml(p, more, preview) {
  const canonical = postUrl(p);
  const body = `${preview ? `<div class="preview-bar">Draft preview. Only you can see this. Not published.</div>` : ""}
<div class="wrap"><div class="crumbs"><a href="/blog/">Blog</a> › ${esc(p.title)}</div>
<article class="article">
  <h1>${esc(p.title)}</h1>
  <div class="post-meta">${p.publishedAt ? `${fmtDate(p.publishedAt)} · ` : ""}${readMins(p.body)} min read</div>
  ${p.coverUrl ? `<figure class="hero-img"><img src="${esc(img(p.coverUrl, 1400))}" alt="${esc(p.coverAlt || p.title)}"/></figure>` : ""}
  <div class="body">${renderMarkdown(p.body)}</div>
  <div class="callout"><h3>Know which rivers are fishing, every morning</h3>
    <p style="color:var(--dim);margin-bottom:14px">Live conditions, official Ontario season status and fly picks for 30+ Southern Ontario rivers.</p>
    <a class="btn primary" href="${APP_URL}">Start your free 7-day trial</a></div>
</article>
${more.length ? `<section style="max-width:1080px;margin:0 auto 40px"><h2 style="font-size:24px;margin:10px 0 0">More from the blog</h2><div class="posts">${more.map(card).join("")}</div></section>` : ""}
</div>`;
  return page({
    title: `${p.title} | ${BRAND}`, description: descOf(p), canonical, body, ogType: "article", stickyCta: "Start free",
    ogImage: p.coverUrl ? abs(img(p.coverUrl, 1200)) : undefined,
    extraHead: `${BLOG_CSS}${preview ? '\n<meta name="robots" content="noindex"/>' : ""}${p.publishedAt ? `\n<meta property="article:published_time" content="${new Date(p.publishedAt).toISOString()}"/>` : ""}`,
    schema: {
      "@context": "https://schema.org", "@type": "BlogPosting", headline: p.title, description: descOf(p),
      image: p.coverUrl ? [abs(img(p.coverUrl, 1200))] : undefined, datePublished: p.publishedAt || undefined, dateModified: p.updatedAt,
      mainEntityOfPage: canonical, author: { "@type": "Organization", name: BRAND, url: SITE_URL },
      publisher: { "@type": "Organization", name: BRAND, logo: { "@type": "ImageObject", url: `${SITE_URL}/crest.png` } },
    },
  });
}

function notFoundHtml() {
  return page({ title: `Post not found | ${BRAND}`, description: "This post doesn't exist.", canonical: `${SITE_URL}/blog/`,
    extraHead: '<meta name="robots" content="noindex"/>',
    body: `<div class="wrap" style="padding:60px 20px;text-align:center"><h1 style="font-size:30px">That post isn't here</h1><p style="margin:14px 0 24px;color:var(--dim)">It may have moved or been unpublished.</p><a class="btn primary" href="/blog/">See all posts</a></div>` });
}

const published = { status: "published", publishedAt: { not: null } };
const noLimit = { config: { rateLimit: false } }; // crawlers arrive through one proxy IP

export default async function blogRoutes(app) {
  const sendHtml = (reply, html, { status = 200, cache = true } = {}) =>
    reply.code(status).header("Content-Type", "text/html; charset=utf-8")
      .header("Cache-Control", cache ? "public, max-age=300" : "no-store").send(html);

  const index = async (req, reply) => {
    const pageNo = Math.max(1, parseInt(req.query?.page, 10) || 1);
    const rows = await prisma.blogPost.findMany({ where: published, orderBy: { publishedAt: "desc" }, skip: (pageNo - 1) * PER_PAGE, take: PER_PAGE + 1 });
    return sendHtml(reply, indexHtml(rows.slice(0, PER_PAGE), pageNo, rows.length > PER_PAGE));
  };
  app.get("/blog", noLimit, index);
  app.get("/blog/", noLimit, index);

  app.get("/blog/feed.xml", noLimit, async (req, reply) => {
    const rows = await prisma.blogPost.findMany({ where: published, orderBy: { publishedAt: "desc" }, take: 30 });
    const items = rows.map((p) => `<item><title>${esc(p.title)}</title><link>${postUrl(p)}</link><guid>${postUrl(p)}</guid><pubDate>${new Date(p.publishedAt).toUTCString()}</pubDate><description>${esc(descOf(p))}</description></item>`).join("");
    return reply.header("Content-Type", "application/rss+xml; charset=utf-8").header("Cache-Control", "public, max-age=600")
      .send(`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${esc(BRAND)} blog</title><link>${SITE_URL}/blog/</link><description>Ontario fishing reports and guides</description>${items}</channel></rss>`);
  });

  app.get("/blog-sitemap.xml", noLimit, async (req, reply) => {
    const rows = await prisma.blogPost.findMany({ where: published, orderBy: { publishedAt: "desc" }, select: { slug: true, updatedAt: true } });
    const urls = [`<url><loc>${SITE_URL}/blog/</loc></url>`, ...rows.map((p) => `<url><loc>${postUrl(p)}</loc><lastmod>${p.updatedAt.toISOString().slice(0, 10)}</lastmod></url>`)];
    return reply.header("Content-Type", "application/xml; charset=utf-8").header("Cache-Control", "public, max-age=600")
      .send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>`);
  });

  const post = async (req, reply) => {
    const slug = String(req.params.slug || "").toLowerCase();
    const p = await prisma.blogPost.findUnique({ where: { slug } });
    const preview = req.query?.preview === "1" && p && isAdmin(await getCurrentUser(req));
    if (!p || (p.status !== "published" && !preview)) return sendHtml(reply, notFoundHtml(), { status: 404, cache: false });
    const more = await prisma.blogPost.findMany({ where: { ...published, id: { not: p.id } }, orderBy: { publishedAt: "desc" }, take: 3 });
    return sendHtml(reply, postHtml(p, more, preview), { cache: !preview });
  };
  app.get("/blog/:slug", noLimit, post);
  app.get("/blog/:slug/", noLimit, post);

  // ── Admin API ──
  const admin = async (req, reply) => { if (!isAdmin(await getCurrentUser(req))) return reply.code(403).send({ error: "forbidden" }); };

  app.get("/api/admin/blog", { preHandler: admin }, async () => ({
    posts: await prisma.blogPost.findMany({ orderBy: [{ updatedAt: "desc" }] }),
  }));

  const clean = (b, partial) => {
    const out = {}, errs = [];
    const str = (v, max) => String(v ?? "").trim().slice(0, max);
    if (!partial || b.title !== undefined) { out.title = str(b.title, 140); if (!out.title) errs.push("title is required"); }
    if (!partial || b.body !== undefined) { out.body = String(b.body ?? "").slice(0, 100_000); if (!out.body.trim()) errs.push("write the post body"); }
    if (b.excerpt !== undefined) out.excerpt = str(b.excerpt, 300);
    if (b.coverAlt !== undefined) out.coverAlt = str(b.coverAlt, 200);
    if (b.coverUrl !== undefined) {
      const u = str(b.coverUrl, 600);
      if (u && !/^(https:\/\/|\/(?!\/))/i.test(u)) errs.push("featured image must be an https URL or a site path");
      out.coverUrl = u || null;
    }
    if (b.slug !== undefined && String(b.slug).trim()) out.slug = slugify(b.slug);
    if (b.status !== undefined) { if (!["draft", "published"].includes(b.status)) errs.push("status must be draft or published"); out.status = b.status; }
    return { out, errs };
  };
  const uniqueSlug = async (base, exceptId) => {
    let s = base || "post", n = 1;
    while (await prisma.blogPost.findFirst({ where: { slug: s, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } })) s = `${base}-${++n}`;
    return s;
  };

  app.post("/api/admin/blog", { preHandler: admin }, async (req, reply) => {
    const { out, errs } = clean(req.body || {}, false);
    if (errs.length) return reply.code(400).send({ error: errs.join("; ") });
    out.slug = await uniqueSlug(out.slug || slugify(out.title));
    if (out.status === "published") out.publishedAt = new Date();
    return { post: await prisma.blogPost.create({ data: out }) };
  });

  app.patch("/api/admin/blog/:id", { preHandler: admin }, async (req, reply) => {
    const existing = await prisma.blogPost.findUnique({ where: { id: req.params.id } });
    if (!existing) return reply.code(404).send({ error: "not found" });
    const { out, errs } = clean(req.body || {}, true);
    if (errs.length) return reply.code(400).send({ error: errs.join("; ") });
    if (out.slug) out.slug = await uniqueSlug(out.slug, existing.id);
    if (out.status === "published" && !existing.publishedAt) out.publishedAt = new Date();
    return { post: await prisma.blogPost.update({ where: { id: existing.id }, data: out }) };
  });

  app.delete("/api/admin/blog/:id", { preHandler: admin }, async (req) => {
    await prisma.blogPost.deleteMany({ where: { id: req.params.id } });
    return { ok: true };
  });

  // Signed Cloudinary upload for featured / inline images.
  app.post("/api/admin/blog/image-sign", { preHandler: admin }, async (req, reply) => {
    if (!config.cloudinary.configured) return reply.code(400).send({ error: "image uploads not configured" });
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = "muddy-york/blog";
    const signature = cloudinarySignature({ folder, timestamp }, config.cloudinary.apiSecret, sha1);
    return { cloudName: config.cloudinary.cloudName, apiKey: config.cloudinary.apiKey, timestamp, folder, signature };
  });
}
