// Pure notes reconciliation for cloud-sync (Phase D).
// Notes are immutable except delete, so merging is a union by id + tombstones —
// no field-level conflict resolution. Kept pure so it is trivially testable; the
// thin network runner (syncNotes) lives below and takes an injected `api`.

const CAP = 300;

// Merge a local note list with notes pulled from the server and a set of deleted
// ids (tombstones). Union by id, drop anything deleted, keep the newest-createdAt
// copy on an id collision, newest-first, capped.
export function mergeNotes(local = [], remote = [], deletedIds = []) {
  const dead = new Set(deletedIds);
  const byId = new Map();
  for (const n of [...local, ...remote]) {
    if (!n || !n.id || dead.has(n.id)) continue;
    const prev = byId.get(n.id);
    if (!prev || new Date(n.createdAt || 0).getTime() >= new Date(prev.createdAt || 0).getTime()) {
      byId.set(n.id, n);
    }
  }
  return [...byId.values()]
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    .slice(0, CAP);
}

// Which local notes has the server not acknowledged yet? Anything whose id is not
// in syncedIds and isn't a tombstone.
export function pendingPushes(local = [], syncedIds = []) {
  const synced = new Set(syncedIds);
  return local.filter((n) => n && n.id && !synced.has(n.id));
}

// Reconcile local notes with the server. `api` is injected:
//   api.pull(since) -> { notes, deleted, serverTime }
//   api.push(note)  -> void      (POST /notes)
// Returns { notes, since, syncedIds }. Network-failure tolerant: on any throw it
// returns the input unchanged so the caller keeps local state and retries later.
export async function syncNotes({ local = [], since = null, syncedIds = [], api }) {
  try {
    const { notes: remote = [], deleted = [], serverTime } = await api.pull(since);
    const merged = mergeNotes(local, remote, deleted);
    // Push anything the server hasn't seen (and that survived the merge).
    const acked = new Set([...syncedIds, ...remote.map((n) => n.id)]);
    const survivors = new Set(merged.map((n) => n.id));
    const toPush = pendingPushes(merged, [...acked]).filter((n) => survivors.has(n.id));
    for (const n of toPush) {
      await api.push(n);
      acked.add(n.id);
    }
    // Deleted ids are done — drop them from the synced set so it can't grow forever.
    const dead = new Set(deleted);
    const nextSynced = [...acked].filter((id) => survivors.has(id) && !dead.has(id));
    return { notes: merged, since: serverTime || since, syncedIds: nextSynced };
  } catch {
    return { notes: local, since, syncedIds };
  }
}
