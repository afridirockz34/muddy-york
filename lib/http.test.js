import { describe, it, expect, vi } from "vitest";
import { fetchWithFallback } from "./http.js";

const ok = (body = "{}") => new Response(body, { status: 200 });
const bad = () => new Response("", { status: 502 });

describe("fetchWithFallback", () => {
  it("returns the first ok response", async () => {
    const f = vi.fn().mockResolvedValueOnce(ok("A"));
    const r = await fetchWithFallback(["u1", "u2"], {}, { retries: 0, fetchImpl: f });
    expect(await r.text()).toBe("A");
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("falls back to the next url when the first fails", async () => {
    const f = vi.fn().mockResolvedValueOnce(bad()).mockResolvedValueOnce(ok("B"));
    const r = await fetchWithFallback(["u1", "u2"], {}, { retries: 0, fetchImpl: f });
    expect(await r.text()).toBe("B");
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("rejects when every url fails", async () => {
    const f = vi.fn().mockResolvedValue(bad());
    await expect(
      fetchWithFallback(["u1", "u2"], {}, { retries: 0, fetchImpl: f })
    ).rejects.toBeTruthy();
  });
});
