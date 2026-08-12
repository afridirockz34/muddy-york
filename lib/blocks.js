// Pure client-side block filter. Given feed items (posts or comments) each
// carrying an `authorId`, drop any whose author is in the blocked set. Used for
// optimistic hiding the instant a user blocks someone; the server enforces the
// same filter on subsequent fetches.
export function applyBlocks(items = [], blockedIds = []) {
  if (!blockedIds.length) return items;
  const blocked = new Set(blockedIds);
  return items.filter((it) => !it || !blocked.has(it.authorId));
}
