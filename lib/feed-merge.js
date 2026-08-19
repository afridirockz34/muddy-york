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
export function mergeFeed(posts = [], derived = []) {
  // Real user posts form the timeline: newest first, and always ABOVE the ambient
  // auto-intel items (which are all stamped "now", so they must not outrank posts).
  const p = posts
    .filter((x) => x && !x.deletedAt)
    .map((x) => ({ ...x, kind: "post", _t: ts(x.createdAt) }))
    .sort((a, b) => b._t - a._t);
  const d = derived.map((x) => ({ ...x, kind: "derived", _t: ts(x.ts) }));
  return [...p, ...d];
}
