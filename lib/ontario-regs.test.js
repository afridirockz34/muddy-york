import { describe, it, expect } from "vitest";
import { reachRegStatus, reachSpeciesStates, mergeRegs, DEFAULT_REGS } from "./ontario-regs.js";

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

  it("reachSpeciesStates gives a per-species breakdown with a season window", () => {
    const rows = reachSpeciesStates({ id: "x", zone: "FMZ 16", species: ["BNT", "STL"] }, june);
    expect(rows.map((r) => r.key)).toEqual(["BNT", "STL"]);
    const bnt = rows.find((r) => r.key === "BNT");
    expect(bnt.state).toBe("open");
    expect(bnt.window).toMatch(/Apr .* Sep 30/);
    expect(rows.find((r) => r.key === "STL").state).toBe("check");
  });

  it("regsUrl points at a real Ontario page (regulations summary)", () => {
    expect(DEFAULT_REGS.regsUrl).toContain("ontario.ca");
    expect(DEFAULT_REGS.regsUrl).not.toContain("fishing-ontario");
  });

  const oct = new Date(2026, 9, 15);  // mid-October
  const grandLower = { id: "grand-lower", zone: "FMZ 16", species: ["STL", "BNTr"] };
  const grandTw = { id: "grand-tw", zone: "FMZ 16", species: ["BNT", "RBT"] };

  it("extended-fall river (Grand below Paris) is In season in October", () => {
    expect(reachRegStatus(grandLower, oct).state).toBe("open");
    expect(reachRegStatus(grandLower, january).state).toBe("closed");
  });

  it("upstream reach (Grand tailwater above Paris) is Closed in October", () => {
    expect(reachRegStatus(grandTw, oct).state).toBe("closed");
    expect(reachRegStatus(grandTw, june).state).toBe("open");
  });

  it("date-aware group override drives the per-species window too", () => {
    const rows = reachSpeciesStates(grandLower, oct);
    expect(rows.every((r) => r.state === "open")).toBe(true);
    expect(rows[0].window).toMatch(/Dec 31/);
  });
});
