import { describe, it, expect } from "vitest";
import { applyBlocks } from "./blocks.js";

const item = (id, authorId) => ({ id, authorId });

describe("applyBlocks", () => {
  it("drops items whose author is blocked", () => {
    const items = [item("a", "u1"), item("b", "u2"), item("c", "u1")];
    expect(applyBlocks(items, ["u1"]).map((x) => x.id)).toEqual(["b"]);
  });
  it("returns everything when nothing is blocked", () => {
    const items = [item("a", "u1")];
    expect(applyBlocks(items, [])).toBe(items); // same ref, no copy
  });
  it("keeps items when no author matches", () => {
    const items = [item("a", "u1"), item("b", "u2")];
    expect(applyBlocks(items, ["u9"]).map((x) => x.id)).toEqual(["a", "b"]);
  });
  it("tolerates empty input", () => {
    expect(applyBlocks([], ["u1"])).toEqual([]);
  });
});
