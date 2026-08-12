# Social Feed — Slice 2: Comments + Block + Moderation (Phase C) — Design

**Date:** 2026-08-11
**App:** Muddy York Angling Co.
**Scope:** Add flat comments, symmetric user blocking, and lightweight admin
moderation on top of slice 1 (posts + likes). Free for signed-in users; reading
public.
**Depends on:** Phase C slice 1 (Post, Like, displayName, `/posts` feed).

## Decisions

- **Comments: flat** (no threads). Create / delete-your-own; count shown on the
  post; expandable list + inline composer under each post.
- **Block: symmetric.** Blocking an angler hides their posts/comments from you and
  yours from them (both directions filtered in queries).
- **Moderation: lightweight.** A single **admin** (identified by `ADMIN_EMAIL`
  matching the user's email — no schema flag) may soft-delete *any* post or
  comment. Reports already email the admin (slice 1). No moderation queue/UI.
- **`authorId` exposed** on posts/comments — an opaque cuid (not PII) so the client
  can target block/admin actions. Email is still never exposed.

## Data model (Prisma)

- `Comment`:
  ```
  id        String    @id @default(cuid())
  postId    String
  userId    String
  body      String
  createdAt DateTime  @default(now())
  deletedAt DateTime?
  post      Post      @relation(fields: [postId], references: [id], onDelete: Cascade)
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([postId, createdAt])
  ```
- `Block`:
  ```
  id        String   @id @default(cuid())
  blockerId String
  blockedId String
  createdAt DateTime @default(now())
  blocker   User     @relation("blocker", fields: [blockerId], references: [id], onDelete: Cascade)
  blocked   User     @relation("blocked", fields: [blockedId], references: [id], onDelete: Cascade)
  @@unique([blockerId, blockedId])
  ```
- `User` gets back-relations: `comments Comment[]`, `blocking Block[] @relation("blocker")`,
  `blockedBy Block[] @relation("blocked")`. `Post` gets `comments Comment[]`.

Schema reaches prod via `prisma db push`.

## Helpers

- **`isAdmin(user)`** (backend) — `!!user && !!ADMIN_EMAIL && user.email === ADMIN_EMAIL`.
- **`blockedIdsFor(userId)`** (backend) — returns the set of user ids to hide:
  union of `blockedId` where blocker = me and `blockerId` where blocked = me.
- **`lib/blocks.js` → `applyBlocks(items, blockedIds)`** (pure, tested) — filter a
  list of `{authorId}` items, dropping any whose `authorId` is blocked. Used for
  optimistic client-side hiding right after a block.

## Backend

Author shape gains `authorId` on posts (slice 1 `shapePost`) and comments.

- **`POST /posts/:id/comments`** (auth) — requires `displayName`; `body` 1..1000
  chars; post must exist and not be blocked-related. Returns the shaped comment.
- **`GET /posts/:id/comments`** (public) — flat list, oldest-first, excludes
  soft-deleted and (when signed in) blocked-both-ways authors. Each item:
  `{ id, body, createdAt, author:{displayName}, authorId, mine }`.
- **`DELETE /comments/:id`** (auth) — soft-delete if owner **or admin**. Idempotent.
- **`POST /users/:id/block`** / **`DELETE /users/:id/block`** (auth) — create/remove
  a Block (idempotent; can't block yourself → 400). Returns `{ ok:true }`.
- **`GET /posts`** and comment lists now exclude blocked-both-ways authors when the
  requester is signed in. Post `commentCount` added to the shape (non-deleted).
- **`DELETE /posts/:id`** (slice 1) extended: owner **or admin**.

Blocking applies via `where:{ userId: { notIn: [...blockedIds] } }` (signed-in
only; signed-out sees the full public feed).

## Frontend

- **PostCard:**
  - Footer gains a **Comment** button showing `commentCount`; toggles an inline
    **CommentsPanel**.
  - **⋯ menu:** own post → Delete; others' → Report, **Block angler**; admin →
    **Remove (admin)** on any post.
- **CommentsPanel** (lazy per post): `GET /posts/:id/comments` on open; list with
  author + delete (own/admin); an inline composer (needs displayName, reuses the
  name prompt pattern). Optimistic add/delete; updates the post's `commentCount`.
- **Block flow:** confirm → `POST /users/:authorId/block` → optimistically remove
  that author's posts/comments from view via `applyBlocks`. An "Unblock" affordance
  lives in Account (list of blocked anglers) — minimal: shows count + clear-all, or
  a simple list with unblock. (Keep to a simple blocked-list in Account.)
- **Admin:** when `me.user` email === the app's admin email (exposed via a
  `me.isAdmin` boolean from `/auth/me`), show admin remove controls.

`/auth/me` returns `isAdmin` so the client can render admin controls without
hardcoding the email.

## Data flow

Open a post's comments → `GET /posts/:id/comments` → render. Add comment →
optimistic append + `POST` → count++. Delete (own/admin) → soft-delete → removed.
Block an angler → `POST /users/:id/block` → their content vanishes locally and is
filtered server-side thereafter (both directions). Admin remove → soft-delete any
item.

## Error handling

- Not signed in → comment composer/like/block/report prompt sign-in; reading
  comments still works.
- No displayName → inline prompt before first comment.
- Block yourself → 400 (client hides the option on own posts anyway).
- Non-admin hitting an admin delete of another's post → falls through own-only
  (no-op), returns ok (no privilege leak).
- Any request fails → optimistic change reverts.

## Testing

- **Unit (Vitest):** `applyBlocks` drops blocked authors, keeps others, handles
  empty. (isAdmin/blockedIdsFor covered via backend tests.)
- **Backend (TEST_DATABASE_URL):** comment create requires displayName + non-empty;
  list is public + oldest-first + excludes deleted; delete own-only **and** admin;
  block is symmetric (A blocks B → neither sees the other in `/posts` and comment
  lists) + idempotent + can't self-block; `commentCount` correct; admin can delete
  any post/comment; `/auth/me` exposes `isAdmin`; auth gating on mutations.
- **Browser (live):** comment on a post; delete own comment; block an angler and
  confirm their posts vanish; unblock; (as admin) remove someone else's post.

## Out of scope

Threaded/nested comments; comment likes; mute (one-way); notifications;
report queue/dashboard; edit comment; rich text / mentions.

## Success criteria

- Signed-in users comment on posts (flat), see counts, and delete their own.
- Blocking an angler symmetrically hides content both ways, server-enforced.
- The admin can remove any post/comment; reads stay public; email never exposed.
