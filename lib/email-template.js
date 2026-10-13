// Branded email for Muddy York Fishing, following the brand guide: pine header
// with the crest, bone body, Playfair-style serif headings (Georgia in email),
// brick call to action, brass rules, and the house signature. Email clients
// ignore most CSS, so this is table layout with inline styles only.
//
// renderEmail({ subject, text, heading, cta: { label, url }, unsubscribe })
//   -> { html, text }
// `text` is the plain message: paragraphs separated by blank lines, "- " list
// lines, bare https links. Any sign-off already in it is replaced by ours.

const C = { pine: "#2C4C3B", ink: "#1F3A2C", brass: "#D4AF37", brassDeep: "#A8862A", brick: "#8B3A3A", bone: "#F4EFE6", panel: "#FBF8F0", line: "#D8CBB3", text: "#2A2A2A", dim: "#6E6253", paper: "#EFE9DB" };
const SITE = "https://muddyyorkfishing.ca";
const SERIF = "Georgia,'Times New Roman',serif";
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

export const SIGNATURE_TEXT = `Tight lines,
The Muddy York Fishing team
info@muddyyorkfishing.ca · ${SITE}`;

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const linkify = (s) => esc(s).replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)]/g, (u) => `<a href="${u}" style="color:${C.brick};text-decoration:underline;word-break:break-all">${u.replace(/^https?:\/\//, "")}</a>`)
  .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

// Drop any sign-off or footer the caller wrote; the template adds the house one.
export function stripSignature(text) {
  return String(text || "")
    .replace(/\n+(Tight lines,?|Thanks,?|Cheers,?)\s*\n[\s\S]*$/i, "")
    .replace(/\n+—\s*\n?Muddy York Fishing[\s\S]*$/i, "")
    .replace(/\n+— Muddy York Fishing[\s\S]*$/i, "")
    .trim();
}

function bodyHtml(text) {
  return stripSignature(text).split(/\n{2,}/).map((block) => {
    const lines = block.split("\n");
    if (lines.every((l) => /^\s*-\s+/.test(l))) {
      return `<ul style="margin:0 0 16px;padding-left:20px">${lines.map((l) => `<li style="margin:0 0 6px">${linkify(l.replace(/^\s*-\s+/, ""))}</li>`).join("")}</ul>`;
    }
    if (lines.every((l) => /^\s{2,}\S/.test(l))) {
      return `<p style="margin:0 0 16px;padding:10px 14px;background:${C.bone};border-radius:8px;font-family:${SANS};font-size:14px;line-height:1.7">${lines.map((l) => linkify(l.trim())).join("<br>")}</p>`;
    }
    return `<p style="margin:0 0 16px">${lines.map(linkify).join("<br>")}</p>`;
  }).join("");
}

export function renderEmail({ subject, text, heading, cta, unsubscribe, preheader } = {}) {
  const pre = preheader || stripSignature(text).split("\n").find((l) => l.trim() && !/^hi\b/i.test(l.trim())) || "";
  const button = cta && cta.url ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 22px"><tr><td style="border-radius:9px;background:${C.brick}">
    <a href="${esc(cta.url)}" style="display:inline-block;padding:13px 24px;font-family:${SANS};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:9px">${esc(cta.label)}</a></td></tr></table>` : "";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(subject || "Muddy York Fishing")}</title></head>
<body style="margin:0;padding:0;background:${C.bone};-webkit-text-size-adjust:100%">
<span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;mso-hide:all">${esc(pre.slice(0, 140))}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bone}"><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${C.panel};border:1px solid ${C.line};border-radius:14px;overflow:hidden">
    <tr><td style="background:${C.pine};border-bottom:3px solid ${C.brass};padding:16px 22px">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="padding-right:12px"><img src="${SITE}/crest.png" width="44" height="44" alt="" style="display:block;border:0;border-radius:50%"></td>
        <td style="font-family:${SERIF};font-size:20px;font-weight:700;color:${C.paper}">Muddy York <span style="color:${C.brass}">Fishing</span></td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:26px 26px 6px;font-family:${SANS};font-size:15.5px;line-height:1.65;color:${C.text}">
      ${heading ? `<h1 style="margin:0 0 14px;font-family:${SERIF};font-size:24px;line-height:1.25;color:${C.pine};font-weight:700">${esc(heading)}</h1>` : ""}
      ${bodyHtml(text)}
      ${button}
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 22px;border-top:1px solid ${C.line};width:100%"><tr><td style="padding-top:16px;font-family:${SANS};font-size:14.5px;line-height:1.6;color:${C.text}">
        Tight lines,<br><span style="font-family:${SERIF};font-size:17px;font-weight:700;color:${C.pine}">The Muddy York Fishing team</span><br>
        <a href="mailto:info@muddyyorkfishing.ca" style="color:${C.dim};text-decoration:none">info@muddyyorkfishing.ca</a> · <a href="${SITE}/fishing/" style="color:${C.dim};text-decoration:none">muddyyorkfishing.ca</a>
      </td></tr></table>
    </td></tr>
    <tr><td style="background:${C.bone};border-top:1px solid ${C.line};padding:14px 26px;font-family:${SANS};font-size:12px;line-height:1.55;color:${C.dim}">
      Muddy York Fishing · Southern Ontario trout and salmon rivers<br>
      Seasons shown in the app come from the Ontario Fishing Regulations Summary. Always confirm the stretch you fish.
      ${unsubscribe ? `<br><a href="${esc(unsubscribe)}" style="color:${C.dim};text-decoration:underline">Unsubscribe from these emails</a>` : ""}
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
  const plain = `${stripSignature(text)}${cta && cta.url ? `\n\n${cta.label}: ${cta.url}` : ""}\n\n${SIGNATURE_TEXT}${unsubscribe ? `\n\nUnsubscribe: ${unsubscribe}` : ""}`;
  return { html, text: plain };
}
