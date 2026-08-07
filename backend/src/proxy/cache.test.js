import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeCache } from "./cache.js";

describe("makeCache", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("returns a stored value before it expires", () => {
    const c = makeCache();
    c.set("k", { a: 1 }, 1000);
    expect(c.get("k")).toEqual({ a: 1 });
  });
  it("expires a value after its ttl", () => {
    const c = makeCache();
    c.set("k", 42, 1000);
    vi.advanceTimersByTime(1500);
    expect(c.get("k")).toBeUndefined();
    expect(c.size()).toBe(0);
  });
  it("returns undefined for a missing key", () => {
    expect(makeCache().get("nope")).toBeUndefined();
  });
});
