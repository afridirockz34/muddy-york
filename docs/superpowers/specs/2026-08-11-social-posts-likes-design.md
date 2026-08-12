# Social Feed — Slice 1: Posts + Likes (Phase C) — Design

**Date:** 2026-08-11
**App:** Muddy York Angling Co.
**Scope:** Turn the read-only News feed into a real social feed: signed-in users
post (text + optional photo + optional coarse river tag), like/unlike, delete
their own, and report others'. Reading is public. Free for any signed-in user.
**Depends on:** auth/session (`/bk` proxy), existing NewsView/FeedCard, Resend
(reports), Prisma/Neon.
**Next slice (out of scope here):** comments, block/mute, moderation queue,
image auto-moderation.

## Purpose

Today the News tab shows auto-derived intel items + an optional external JSON
source; the Like/Comment chips are decorative. This slice adds genuine
user-generated content — the heart of a fishing community — while preserving the
app's no-exact-spots ethos (posts tag a river, never GPS).

## Decisions (locked in brainstorming)

- **Photos:** Cloudinary **signed direct upload** — browser uploads straight to
  Cloudinary; the backend only issues a signature (API secret stays server-side).
  Keeps large bytes off Render.
- **Scope:** posts + likes first; comments/moderation are a later slice.
- **Identity:** public **display name** chosen on first post (email never shown);
  editable in Account.
- **Location:** a post may tag a **river from the known list** (coarse) — never
  GPS coordinates.
- **Safety in v1:** delete-your-own (soft delete) + a lightweight **Report** that
  emails the admin (no data model). Full moderation later.
- **Access:** posting/liking free for any signed-in user; feed read is public.

## Data model (Prisma)

- `User` gains `displayName String?` — public handle. Required (non-null at
  runtime) to post; nullable in schema for existing users.
- `Post`:
  ```
  id        String    @id @default(cuid())
  userId    String
  body      String    @default("")
  photoUrl  String?
  photoW    Int?
  photoH    Int?
  river     String?                 // coarse tag, e.g. "Credit River" — never GPS
  category  String    @default("Report")
  createdAt DateTime  @default(now())
  deletedAt DateTime?                // soft delete
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  likes     Like[]
  @@index([createdAt])
  ```
- `Like`:
  ```
  id        String   @id @default(cuid())
  postId    String
  userId    String
  createdAt DateTime @default(now())
  post      Post     @relation(fields: [postId], references: [id], onDelete: Cascade)
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([postId, userId])         // double-like impossible
  ```

Schema reaches production via `prisma db push` (existing deploy build command).

## Backend

Config (`config.cloudinary`): `cloudName`, `apiKey`, `apiSecret`, `folder`
(default `muddy-york/posts`), from `CLOUDINARY_*` env. `configured` = all three
core values present.

- **`POST /posts`** (auth) — body `{ body?, photoUrl?, photoW?, photoH?, river?,
  category? }`. 400 if the user has no `displayName`. 400 if both body and
  photoUrl are empty. Trims/caps body (e.g. 2000 chars). `river` validated
  against the known rivers list (else stored null). Returns the shaped post.
- **`DELETE /posts/:id`** (auth) — own only (`where:{id,userId}`); sets
  `deletedAt`. Idempotent (200 even if absent/already-deleted).
- **`POST /posts/:id/like`** (auth) — upsert a Like by `@@unique`; idempotent.
  **`DELETE /posts/:id/like`** — `deleteMany`; idempotent. Both return
  `{ likeCount, likedByMe }`.
- **`GET /posts?before=<ISO>&limit=`** (public) — newest-first page of non-deleted
  posts (default limit 20, max 50). Each item: `{ id, body, photoUrl, photoW,
  photoH, river, category, createdAt, author:{ displayName }, likeCount,
  likedByMe }`. `likedByMe` is false when signed out. Cursor = `createdAt` of the
  last item (`before` returns strictly older).
- **`POST /posts/photo-sign`** (auth) — 400 if Cloudinary not configured; else
  returns `{ cloudName, apiKey, timestamp, folder, signature }`. Signature =
  `sha1` of the sorted params (`folder`, `timestamp`) + apiSecret, via a pure
  helper `cloudinarySignature(params, secret)`.
- **`PATCH /me`** (auth) — `{ displayName }`; trims, caps (~40 chars), rejects
  empty; stores on the user. Returns `{ user }`.
- **`POST /posts/:id/report`** (auth) — emails the admin (Resend) the post id +
  reporter email; returns `{ ok:true }`. No persistence.

Ownership enforced by `where:{userId}` on mutations. All mutations 401 when
unauthenticated; `GET /posts` never leaks another user's private data (only
`displayName` is public).

## Pure, testable helpers

- **`lib/cloudinary-sign.js`** — `cloudinarySignature(params, secret)` →
  deterministic sha1 hex of `k=v` pairs joined by `&` in sorted key order, with
  secret appended (Cloudinary's documented scheme). No network. (Backend uses
  Node `crypto`; helper takes an injected hasher or uses `crypto` directly.)
- **`lib/feed-merge.js`** — `mergeFeed(posts, derived)` → interleave real posts
  (mapped to feed items with `kind:"post"`) and derived/external items
  (`kind:"derived"`) sorted by timestamp desc; drop soft-deleted; stable.

## Frontend

- **Composer** (top of News, signed-in only): textarea + photo picker (preview +
  upload progress) + optional river `<select>` (from RIVERS) + Post button.
  - If `me.user` has no `displayName`, an inline field asks for one and `PATCH
    /me` saves it before the first post.
  - Photo picker disabled with a hint when Cloudinary isn't configured
    (`GET /posts/photo-sign` → 400 / a `configured` flag from `/billing`-style
    config; simplest: attempt sign lazily on file-select and disable on 400).
  - On submit: if a photo is staged, sign → upload to Cloudinary → get
    `secure_url` + width/height → `POST /posts`; else `POST /posts` directly.
    Optimistic prepend to the feed.
- **FeedCard** upgraded: author Crest + `displayName` (or "Muddy York" for derived
  items), rendered photo (respecting `photoW/H` aspect), **working Like** (toggle,
  optimistic count, filled icon when `likedByMe`), a **delete** control on own
  posts, a **⋯ → Report** on others'. Derived items keep today's look, no
  like/delete.
- **Feed data:** on News open, `GET /posts` (first page); merge with derived/ext
  via `mergeFeed`. "Load more" pages with `before` cursor. Like/delete update
  local state optimistically and reconcile with the server response.
- Account panel gains an **edit display name** control (reuses `PATCH /me`).

## Data flow

signed-in user writes text (+ optionally picks a photo) → [photo: sign → direct
Cloudinary upload → secure_url] → `POST /posts` → optimistic prepend → server
returns shaped post. Any viewer opens News → `GET /posts` → merged feed. Like →
`POST /posts/:id/like` → count/likedByMe update. Delete own → soft-delete →
removed locally. Report → email to admin.

## Error handling

- Not signed in → composer hidden; feed still reads; like/delete/report prompt
  sign-in.
- No `displayName` → inline prompt blocks posting until set.
- Cloudinary unconfigured or sign fails → photo picker disabled/reverts to
  text-only; posting text still works.
- Cloudinary upload fails → surface a retry in the composer; post not created.
- `POST /posts` with empty body and no photo → 400 (client guards too).
- Duplicate like / unlike-when-not-liked → idempotent no-ops.
- Feed request fails → keep derived-only feed (no regression to today's News).

## Testing

- **Unit (Vitest):** `cloudinarySignature` deterministic + order-independent;
  `mergeFeed` interleaves by ts, drops soft-deleted, stable, handles empty sides.
- **Backend (TEST_DATABASE_URL):** post requires displayName (400 without);
  create+shape; delete own-only (can't delete another's); like toggle idempotent
  + unique (double-like = 1); `GET /posts` shape incl. likeCount/likedByMe and
  `before` paging; `photo-sign` 400 when unconfigured, signature when configured;
  `PATCH /me` sets displayName; report returns ok; auth gating on all mutations.
- **Browser (live):** set display name → post text → appears; like/unlike;
  delete own; (with Cloudinary keys) attach a photo end-to-end.

## Out of scope

Comments; block/mute; moderation queue/admin UI; image auto-moderation;
edit-post; @mentions; notifications.

## Success criteria

- A signed-in user sets a display name, posts text (and, with Cloudinary
  configured, a photo tagged to a river), and it appears in everyone's feed.
- Likes toggle and are double-safe; users can delete only their own posts and
  report others'; exact GPS never appears on a post.
- Signed-out users can read the feed; the existing derived intel still shows.
