// Small, safe Markdown → HTML for blog posts. Everything is escaped first, so
// raw HTML in a post renders as text; only this syntax becomes markup:
//   ## / ### headings · paragraphs · **bold** · *italic* · [link](url)
//   ![alt](image-url) · - or * lists · 1. lists · > quotes · --- rules
//   | pipe | tables | (header row, then a |---| separator row)
// Links and images must be http(s) or site-relative.

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const safeUrl = (u) => {
  const t = String(u).trim();
  return /^(https?:\/\/|\/(?!\/))/i.test(t) ? t : null;
};

function inline(text, siteHost) {
  let s = esc(text);
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, url) => {
    const u = safeUrl(url.replace(/&amp;/g, "&"));
    return u ? `<img src="${esc(u)}" alt="${alt}" loading="lazy"/>` : m;
  });
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, url) => {
    const u = safeUrl(url.replace(/&amp;/g, "&"));
    if (!u) return m;
    const external = /^https?:\/\//i.test(u) && !(siteHost && new URL(u).hostname.endsWith(siteHost));
    return `<a href="${esc(u)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ""}>${label}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
  return s;
}

export function renderMarkdown(md, { siteHost = "muddyyorkfishing.ca" } = {}) {
  const lines = String(md || "").replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let para = [], list = null, table = null;
  const cells = (l) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  const flushTable = () => {
    if (!table) return;
    const [head, ...rows] = table;
    out.push(`<div class="tbl-wrap"><table><thead><tr>${head.map((c) => `<th>${inline(c, siteHost)}</th>`).join("")}</tr></thead><tbody>`
      + rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c, siteHost)}</td>`).join("")}</tr>`).join("") + "</tbody></table></div>");
    table = null;
  };
  const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join(" "), siteHost)}</p>`); para = []; } };
  const flushList = () => { if (list) { out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i, siteHost)}</li>`).join("")}</${list.tag}>`); list = null; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    let m;
    if (/^\s*\|.*\|\s*$/.test(line)) {
      flushPara(); flushList();
      if (/^\s*\|[\s|:-]+\|\s*$/.test(line)) continue; // the |---| separator
      (table ||= []).push(cells(line));
      continue;
    }
    flushTable();
    if (!line.trim()) { flushPara(); flushList(); continue; }
    if ((m = line.match(/^(#{2,4})\s+(.*)$/))) { flushPara(); flushList(); const n = m[1].length; out.push(`<h${n}>${inline(m[2], siteHost)}</h${n}>`); continue; }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { flushPara(); flushList(); out.push("<hr/>"); continue; }
    if ((m = line.match(/^>\s?(.*)$/))) { flushPara(); flushList(); out.push(`<blockquote><p>${inline(m[1], siteHost)}</p></blockquote>`); continue; }
    if ((m = line.match(/^\s*[-*]\s+(.*)$/))) { flushPara(); if (!list || list.tag !== "ul") { flushList(); list = { tag: "ul", items: [] }; } list.items.push(m[1]); continue; }
    if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) { flushPara(); if (!list || list.tag !== "ol") { flushList(); list = { tag: "ol", items: [] }; } list.items.push(m[1]); continue; }
    flushList(); para.push(line.trim());
  }
  flushPara(); flushList(); flushTable();
  // Merge consecutive quote lines into one blockquote.
  return out.join("\n").replace(/<\/blockquote>\n<blockquote>/g, "\n");
}

// Plain text (for excerpts, meta descriptions and reading time).
export function markdownText(md) {
  return String(md || "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s*\|[\s|:-]+\|\s*$/gm, "")
    .replace(/\|/g, " ")
    .replace(/^#{1,6}\s+|^>\s?|^\s*[-*]\s+|^\s*\d+[.)]\s+/gm, "")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
