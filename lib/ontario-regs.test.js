import { describe, it, expect } from "vitest";
import { reachRegStatus, mergeRegs, DEFAULT_REGS } from "./ontario-regs.js";

const june = new Date(2026, 5, 15);   // mid-June: stream trout open
const january = new Date(2026, 0, 15); // mid-January: stream trout closed

describe("reachRegStatus", () => {
  it("stream trout (brook/brown) is In season in summer", () => {
    const r = reachRegStatus({ id: "x", zone: "FMZ 16", species: ["BKT", "BNT"] }, june);
    expect(r.state).toBe("open");
    expect(r.label).toBe("In season");
    expect(r.tone).toBe("green");
  });

  it("stream trout is Closed now in winter", () => {
    const r = reachRegStatus({ id: "x", zone: "FMZ 16", species: ["BKT"] }, january);
    expect(r.state).toBe("closed");
    expect(r.label).toBe("Closed now");
  });

  it("migratory species (steelhead) always defers to Check regs", () => {
    expect(reachRegStatus({ id: "x", zone: "FMZ 16", species: ["STL"] }, june).state).toBe("check");
    expect(reachRegStatus({ id: "x", zone: "FMZ 16", species: ["STL"] }, january).state).toBe("check");
  });

  it("a mix of open + migratory rolls up to Check regs (never a false open)", () => {
    const r = reachRegStatus({ id: "x", zone: "FMZ 16", species: ["BNT", "RBT"] }, june);
    expect(r.state).toBe("check");
  });

  it("exception-flagged or multi-zone strings defer to Check regs", () => {
    expect(reachRegStatus({ id: "x", zone: "FMZ 17 — check exceptions", species: ["BKT"] }, june).state).toBe("check");
    expect(reachRegStatus({ id: "x", zone: "FMZ 16 / mouth 14", species: ["BKT"] }, june).state).toBe("check");
  });

  it("a per-reach override wins over the species roll-up", () => {
    const regs = mergeRegs({ reaches: { "grand-tw": { state: "open", detail: "Year-round tailwater fishery." } } });
    const r = reachRegStatus({ id: "grand-tw", zone: "FMZ 16", species: ["BNT", "RBT"] }, january, regs);
    expect(r.state).toBe("open");
    expect(r.detail).toMatch(/year-round/i);
  });

  it("always carries a regs URL and never throws on bad input", () => {
    expect(reachRegStatus(null).regsUrl).toBeTruthy();
    expect(reachRegStatus({ id: "x", zone: "FMZ 16", species: [] }, june).state).toBe("check");
  });

  it("mergeRegs falls back to bundled defaults for junk input", () => {
    expect(mergeRegs(null)).toBe(DEFAULT_REGS);
    expect(mergeRegs({}).groups.streamTrout).toBeTruthy();
  });
});
