import { describe, it, expect } from "vitest";
import { mergeFeed } from "./feed-merge.js";

describe("mergeFeed", () => {
  it("interleaves posts and derived items newest-first by timestamp", () => {
    const posts = [{ id: "p1", createdAt: "2026-08-05T00:00:00Z" }];
    const derived = [
      { id: "d1", ts: "2026-08-06T00:00:00Z" },
      { id: "d2", ts: "2026-08-04T00:00:00Z" },
    ];
    expect(mergeFeed(posts, derived).map((x) => x.id)).toEqual(["d1", "p1", "d2"]);
  });
  it("tags each item with its kind", () => {
    const out = mergeFeed([{ id: "p1", createdAt: "2026-08-05" }], [{ id: "d1", ts: "2026-08-01" }]);
    expect(out.find((x) => x.id === "p1").kind).toBe("post");
    expect(out.find((x) => x.id === "d1").kind).toBe("derived");
  });
  it("drops soft-deleted posts", () => {
    const posts = [
      { id: "live", createdAt: "2026-08-05" },
      { id: "dead", createdAt: "2026-08-06", deletedAt: "2026-08-07" },
    ];
    expect(mergeFeed(posts, []).map((x) => x.id)).toEqual(["live"]);
  });
  it("handles empty sides", () => {
    expect(mergeFeed([], [])).toEqual([]);
    expect(mergeFeed([{ id: "p", createdAt: "2026-08-01" }], []).map((x) => x.id)).toEqual(["p"]);
  });
});
