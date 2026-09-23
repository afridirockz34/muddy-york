// Pure feed merge: interleave real user posts with the app's derived/external
// intel items into one timeline, newest first, dropping soft-deleted posts.
// Each side is tagged with `kind` so the UI can render posts (interactive) vs
// derived items (read-only) differently.

function ts(v) {
  const t = new Date(v || 0).getTime();
  return Number.isNaN(t) ? 0 : t;
}

// posts: [{ id, createdAt, deletedAt?, ... }]  (from GET /posts)
// derived: [{ id, ts?, relevance?, ... }]      (existing NewsView items)
export function mergeFeed(posts = [], derived = [], ratio = 2) {
  // A balanced mix: real customer posts (newest first) are woven THROUGH the
  // ambient auto-intel (also newest first) at ~1 post per `ratio` news items, so
  // posts are always visible and never buried under a wall of fresh auto-news.
  const p = posts.filter((x) => x && !x.deletedAt).map((x) => ({ ...x, kind: "post", _t: ts(x.createdAt) })).sort((a, b) => b._t - a._t);
  const d = derived.map((x) => ({ ...x, kind: "derived", _t: ts(x.ts) })).sort((a, b) => b._t - a._t);
  const out = [];
  let pi = 0, di = 0;
  while (pi < p.length || di < d.length) {
    if (pi < p.length) out.push(p[pi++]);
    for (let k = 0; k < ratio && di < d.length; k++) out.push(d[di++]);
  }
  return out;
}
