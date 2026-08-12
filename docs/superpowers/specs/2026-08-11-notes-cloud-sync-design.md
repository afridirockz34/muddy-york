# Notes Cloud-Sync (Phase D) — Design

**Date:** 2026-08-11
**App:** Muddy York Angling Co.
**Scope:** Back up private Notes to the server and sync them across a signed-in
user's devices, local-first, with tombstone deletes. Notes stay a free feature.
**Depends on:** auth/session (cookies via `/bk` proxy), IndexedDB notes store,
`lib/notes-model.js`.

## Purpose

Today Notes live only in on-device IndexedDB (create + delete, no edit; optional
GPS pin). Clearing the browser or switching phones loses them. This adds a private
per-user server copy so notes **follow the signed-in user across devices** and
survive device loss — without regressing the signed-out, local-only experience.

## Decisions (locked in brainstorming)

- **Sync model:** backup **+ cross-device**. Local-first: notes always work
  offline against IndexedDB; when `API_BASE && me.user`, they reconcile with the
  server.
- **GPS pins:** store **full coordinates, private** to the owner (same trust model
  as `SavedSpot`). Only the owner can ever read them.
- **Deletes:** **tombstones** (`deletedAt`) so a delete on one device propagates
  instead of resurrecting from another device's copy. Server purges tombstones
  after ~90 days.
- **Indicator:** a small **"Synced ✓ / Backing up…"** line on the Notes header when
  signed in. Nothing shown when signed out.
- Notes are immutable except for delete (no edit) → **no field-level conflict
  resolution**; merge is a set-union by id plus tombstones.

## Data model

New Prisma `Note` model (private per user, mirrors `SavedSpot`/`Catch`):

```
model Note {
  id        String    @id            // client-generated (e.g. "n<ts><rand>"); PK
  userId    String
  title     String    @default("")
  body      String    @default("")
  technique String    @default("")
  flies     String    @default("")
  species   String    @default("")
  size      String    @default("")
  lat       Float?
  lon       Float?
  createdAt DateTime                  // client's original createdAt (preserved)
  updatedAt DateTime  @updatedAt      // server-side change stamp; drives ?since
  deletedAt DateTime?                 // tombstone
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId, updatedAt])
}
```

Client-generated `id` as PK makes re-pushing idempotent (upsert). `updatedAt` is
the server change stamp used by `GET /notes?since=`. `createdAt` is taken from the
client note so ordering is stable across devices.

## Backend (auth-gated, under `/bk`)

- **`POST /notes`** — body is a note (`{id,title,body,technique,flies,species,
  size,lat,lon,createdAt}`). Upsert by `id` scoped to the user; clears any
  `deletedAt` only on a genuine re-create (create wins over an older tombstone by
  `createdAt`, but a re-pushed existing note never revives a newer delete — see
  merge rules). Returns the stored note.
- **`DELETE /notes/:id`** — sets `deletedAt = now()` for that user's note
  (idempotent; 200 even if already deleted / absent so offline retries are safe).
- **`GET /notes?since=<ISO>`** — returns `{ notes: [...], deleted: [ids],
  serverTime }` for rows with `updatedAt > since` (or all when `since` omitted).
  `serverTime` is echoed back so the client stores it as the next `since` cursor
  (avoids clock skew). Only the caller's own rows, ever.

All three 401 when unauthenticated. Ownership is enforced by `where:{userId}` on
every query (a user can never read/delete another's note).

## Frontend

- **`lib/notes-sync.js`** (pure + thin runner):
  - `mergeNotes(local, remote, deletedIds)` → pure: union by id, drop ids in
    `deletedIds`, keep newest-`createdAt` on id collision, sort newest-first, cap
    300. Unit-tested.
  - `syncNotes({ local, lastSince, api })` → runner: `GET ?since`, apply remote
    deletes + union remote, push local notes the server hasn't acknowledged
    (tracked by an `syncedIds` set / `unsynced` flag in IndexedDB), return
    `{ notes, since }`. Network-failure tolerant (offline → no-op, try again next
    pass).
- **App wiring:** `addNote` and `removeNote` stay optimistic-local (unchanged UX).
  When `API_BASE && me.user`: `addNote` also `POST`s; `removeNote` also `DELETE`s;
  a sync pass runs on sign-in, on app open, and after `refreshMe` flips to a user.
  `since` cursor + `unsynced` ids persisted in IndexedDB (`notesSince`,
  `notesUnsynced`).
- **Indicator:** Notes header shows `Backing up…` while a push/pull is in flight,
  `Synced ✓` when the local set matches the server, nothing when signed out.

## Data flow

sign in → sync pass: `GET /notes?since=null` → merge into local, push any
local-only notes → store `since=serverTime`. Add note → local insert + `POST`.
Delete → local remove + `DELETE` (tombstone). Open app on device B → sync pass
pulls the new note (and any tombstones) → appears / disappears. Offline adds queue
in `notesUnsynced` and flush on the next successful pass.

## Error handling

- Signed out / no `API_BASE` → pure local behavior, zero network (no regression).
- Any sync request fails (offline, cold start) → keep local state, mark work
  pending, retry next pass; indicator falls back to nothing rather than an error.
- `POST` of an id the server already has → idempotent upsert (no dup).
- `DELETE` of an unknown/already-deleted id → 200 (safe offline retry).
- Clock skew → client always uses server-echoed `serverTime` as the next `since`.

## Testing

- **Unit (Vitest):** `mergeNotes` — union, tombstone removes, newest-createdAt on
  collision, 300 cap, idempotent re-merge; `syncNotes` runner with a mocked api
  (pull applies deletes, pushes unsynced, tolerates rejection).
- **Backend (TEST_DATABASE_URL):** `POST` upserts and is idempotent; `DELETE`
  tombstones and is idempotent; `GET ?since` returns only changed rows + deleted
  ids; **ownership isolation** — user B's `GET` never sees user A's notes, B can't
  `DELETE` A's note; all endpoints 401 unauthenticated.

## Out of scope

- Editing note fields (still create/delete only).
- Sharing notes with other users; photo attachments (Phase C territory).
- Real-time push (sync is pull-on-open / on-change, not websocket).

## Success criteria

- A signed-in user adds a note on one device and sees it on another after opening
  the app; deleting on one device removes it on the other (tombstone), no
  resurrection.
- Signed-out users are unaffected — Notes remain fully local with no network.
- No user can read or delete another user's notes; GPS pins are stored private.
