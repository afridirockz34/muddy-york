import { describe, it, expect } from "vitest";
import { mergeFeed } from "./feed-merge.js";

describe("mergeFeed", () => {
  it("weaves posts through the news so posts stay visible (1 post : ratio news)", () => {
    const posts = [
      { id: "p1", createdAt: "2026-08-05T00:00:00Z" },
      { id: "p2", createdAt: "2026-08-07T00:00:00Z" },
    ];
    const derived = [
      { id: "d1", ts: "2026-08-06T00:00:00Z" },
      { id: "d2", ts: "2026-08-04T00:00:00Z" },
      { id: "d3", ts: "2026-08-03T00:00:00Z" },
    ];
    // newest post first, then up to `ratio` news, then next post, then the rest.
    expect(mergeFeed(posts, derived, 2).map((x) => x.id)).toEqual(["p2", "d1", "d2", "p1", "d3"]);
  });
  it("posts are never buried even when there is a wall of fresh news", () => {
    const posts = [{ id: "p1", createdAt: "2020-01-01" }]; // old post
    const derived = Array.from({ length: 20 }, (_, i) => ({ id: "d" + i, ts: "2026-09-23" }));
    // the (old) post still surfaces at the very top of the mix, not buried under 20 news.
    expect(mergeFeed(posts, derived, 2)[0].id).toBe("p1");
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
