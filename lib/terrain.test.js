import { describe, it, expect, vi } from "vitest";
import { elevations } from "./terrain.js";

describe("elevations", () => {
  it("returns elevations aligned to input points", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ elevation: [100, 250] }), { status: 200 })
    );
    const r = await elevations([{ lat: 43.7, lon: -80.3 }, { lat: 44.0, lon: -80.5 }], { fetchImpl });
    expect(r).toEqual([100, 250]);
  });
  it("falls back to 200 m on failure", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("net"));
    const r = await elevations([{ lat: 43.7, lon: -80.3 }], { fetchImpl });
    expect(r).toEqual([200]);
  });
});
