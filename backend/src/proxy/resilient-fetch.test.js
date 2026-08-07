import { describe, it, expect, vi } from "vitest";
import { resilientFetch } from "./resilient-fetch.js";

const ok = (b = "{}") => new Response(b, { status: 200 });
const bad = () => new Response("", { status: 502 });

describe("resilientFetch", () => {
  it("returns the first ok response", async () => {
    const f = vi.fn().mockResolvedValueOnce(ok("A"));
    const r = await resilientFetch(["u1", "u2"], {}, { retries: 0, fetchImpl: f, backoffMs: 0 });
    expect(await r.text()).toBe("A");
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("falls back to the next url", async () => {
    const f = vi.fn().mockResolvedValueOnce(bad()).mockResolvedValueOnce(ok("B"));
    const r = await resilientFetch(["u1", "u2"], {}, { retries: 0, fetchImpl: f, backoffMs: 0 });
    expect(await r.text()).toBe("B");
  });
  it("rejects when all fail", async () => {
    const f = vi.fn().mockResolvedValue(bad());
    await expect(resilientFetch(["u1", "u2"], {}, { retries: 0, fetchImpl: f, backoffMs: 0 })).rejects.toBeTruthy();
  });
});
