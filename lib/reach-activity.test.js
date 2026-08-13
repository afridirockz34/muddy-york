import { describe, it, expect } from "vitest";
import { reachActivity } from "./reach-activity.js";

const now = Date.parse("2026-08-12T00:00:00Z");
const daysAgo = (d) => new Date(now - d * 86400000).toISOString();

describe("reachActivity", () => {
  it("aggregates catches and notes per reach with momentum", () => {
    const out = reachActivity({
      catches: [
        { ref: "grand-tw", species: "Brown trout", sizeInches: 18, caughtAt: daysAgo(2) },
        { ref: "grand-tw", species: "Brown trout", sizeInches: 22, caughtAt: daysAgo(5) },
      ],
      notes: [{ ref: "grand-tw", species: "Rainbow trout", createdAt: daysAgo(1) }],
      now,
    });
    expect(out["grand-tw"].count30d).toBe(2);
    expect(out["grand-tw"].notes30d).toBe(1);
    expect(out["grand-tw"].momentum).toBeGreaterThan(0);
    expect(out["grand-tw"].lastDays).toBe(1); // the note is most recent
  });

  it("ranks top species (catches weigh more than notes) and computes size stats", () => {
    const out = reachActivity({
      catches: [
        { ref: "r", species: "Brown trout", sizeInches: 16, caughtAt: daysAgo(1) },
        { ref: "r", species: "Brown trout", sizeInches: 20, caughtAt: daysAgo(2) },
      ],
      notes: [{ ref: "r", species: "Rainbow trout", createdAt: daysAgo(1) }],
      now,
    });
    expect(out["r"].topSpecies[0]).toEqual({ species: "Brown trout", n: 2 });
    expect(out["r"].sizeBySpecies["Brown trout"]).toEqual({ avg: 18, max: 20, n: 2 });
  });

  it("ignores logs outside the window and rows without a ref", () => {
    const out = reachActivity({
      catches: [
        { ref: "r", species: "X", caughtAt: daysAgo(200) },
        { ref: null, species: "Y", caughtAt: daysAgo(1) },
      ],
      notes: [],
      now,
    });
    expect(out["r"]).toBeUndefined();
    expect(Object.keys(out)).toHaveLength(0);
  });
});
