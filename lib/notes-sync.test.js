import { describe, it, expect, vi } from "vitest";
import { mergeNotes, pendingPushes, syncNotes } from "./notes-sync.js";

const note = (id, createdAt, extra = {}) => ({ id, createdAt, title: id, ...extra });

describe("mergeNotes", () => {
  it("unions local and remote by id, newest-createdAt first", () => {
    const local = [note("a", "2026-01-02")];
    const remote = [note("b", "2026-01-03")];
    expect(mergeNotes(local, remote).map((n) => n.id)).toEqual(["b", "a"]);
  });
  it("drops ids present in the tombstone list", () => {
    const local = [note("a", "2026-01-02"), note("b", "2026-01-03")];
    expect(mergeNotes(local, [], ["b"]).map((n) => n.id)).toEqual(["a"]);
  });
  it("dedups an id collision, keeping the newest createdAt", () => {
    const local = [note("a", "2026-01-01", { title: "old" })];
    const remote = [note("a", "2026-01-05", { title: "new" })];
    const out = mergeNotes(local, remote);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("new");
  });
  it("is idempotent when re-merged with itself", () => {
    const merged = mergeNotes([note("a", "2026-01-01")], [note("b", "2026-01-02")]);
    expect(mergeNotes(merged, merged)).toEqual(merged);
  });
  it("caps at 300 notes", () => {
    const many = Array.from({ length: 350 }, (_, i) => note("n" + i, "2026-01-01T00:" + String(i % 60).padStart(2, "0")));
    expect(mergeNotes(many, [])).toHaveLength(300);
  });
});

describe("pendingPushes", () => {
  it("returns local notes not yet acknowledged by the server", () => {
    const local = [note("a", "1"), note("b", "2")];
    expect(pendingPushes(local, ["a"]).map((n) => n.id)).toEqual(["b"]);
  });
});

describe("syncNotes", () => {
  it("pulls remote, applies deletes, and pushes unsynced local notes", async () => {
    const api = {
      pull: vi.fn().mockResolvedValue({ notes: [note("r", "2026-02-01")], deleted: ["old"], serverTime: "2026-02-02" }),
      push: vi.fn().mockResolvedValue(undefined),
    };
    const local = [note("local", "2026-01-15"), note("old", "2026-01-10")];
    const res = await syncNotes({ local, since: null, syncedIds: [], api });
    // old was tombstoned; remote r pulled in; local pushed up.
    expect(res.notes.map((n) => n.id).sort()).toEqual(["local", "r"]);
    expect(api.push).toHaveBeenCalledTimes(1);
    expect(api.push.mock.calls[0][0].id).toBe("local");
    expect(res.since).toBe("2026-02-02");
  });
  it("does not re-push notes the server already acknowledged", async () => {
    const api = {
      pull: vi.fn().mockResolvedValue({ notes: [note("a", "1")], deleted: [], serverTime: "t" }),
      push: vi.fn().mockResolvedValue(undefined),
    };
    await syncNotes({ local: [note("a", "1")], since: null, syncedIds: ["a"], api });
    expect(api.push).not.toHaveBeenCalled();
  });
  it("returns local unchanged when the network throws", async () => {
    const api = { pull: vi.fn().mockRejectedValue(new Error("offline")), push: vi.fn() };
    const local = [note("a", "1")];
    const res = await syncNotes({ local, since: "s", syncedIds: ["a"], api });
    expect(res).toEqual({ notes: local, since: "s", syncedIds: ["a"] });
  });
});
