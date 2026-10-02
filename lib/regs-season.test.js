import { describe, it, expect } from "vitest";
import { parseDay, seasonWindows, inWindows, cleanSeason, windowsLabel } from "./regs-season.js";

const ymd = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

describe("parseDay", () => {
  it("reads fixed and computed dates", () => {
    expect(ymd(parseDay("September 30", 2026))).toBe("2026-9-30");
    expect(ymd(parseDay("fourth Saturday in April", 2026))).toBe("2026-4-25");
    expect(ymd(parseDay("Friday before fourth Saturday in April", 2026))).toBe("2026-4-24");
    expect(ymd(parseDay("Friday before the second Saturday in May", 2026))).toBe("2026-5-8");
    expect(ymd(parseDay("third Saturday in June", 2026))).toBe("2026-6-20");
    expect(ymd(parseDay("last day in February", 2028))).toBe("2028-2-29");
    expect(ymd(parseDay("Labour Day", 2026))).toBe("2026-9-7");
  });
  it("returns null for wording it doesn't know", () => {
    expect(parseDay("ice-out", 2026)).toBeNull();
    expect(parseDay("Smarch 3", 2026)).toBeNull();
  });
});

describe("seasonWindows", () => {
  it("handles all-year and closed", () => {
    expect(seasonWindows("open all year", 2026)).toBe("all");
    expect(seasonWindows("Fish sanctuary - closed all year", 2026)).toBe("none");
  });
  it("handles a single window with framing words", () => {
    const w = seasonWindows("open from fourth Saturday in April to December 31 (extended fall season)", 2026);
    expect(w).toHaveLength(1);
    expect(inWindows(new Date(2026, 9, 1), w)).toBe(true);
    expect(inWindows(new Date(2026, 3, 24), w)).toBe(false);
  });
  it("handles sanctuary closures with two windows", () => {
    const w = seasonWindows("Fish sanctuary - no fishing from January 1 to Friday before fourth Saturday in April and August 15 to December 31", 2026);
    expect(w).toHaveLength(2);
    expect(inWindows(new Date(2026, 8, 29), w)).toBe(true);   // Sept 29: closed
    expect(inWindows(new Date(2026, 5, 1), w)).toBe(false);   // June 1: not closed
    expect(inWindows(new Date(2026, 3, 24, 12), w)).toBe(true); // Friday before opener
    expect(inWindows(new Date(2026, 3, 25, 6), w)).toBe(false); // opening day
  });
  it("handles en-dash framing and 'and from'", () => {
    const w = seasonWindows("No Fishing – September 1 to October 14", 2026);
    expect(inWindows(new Date(2026, 9, 14, 20), w)).toBe(true);
    const x = seasonWindows("open from fourth Saturday in April to August 31 and from October 15 to December 31", 2026);
    expect(x).toHaveLength(2);
    expect(inWindows(new Date(2026, 8, 20), x)).toBe(false);
  });
  it("wraps across the new year", () => {
    const w = seasonWindows("December 1 to March 15", 2026);
    expect(inWindows(new Date(2026, 1, 10), w)).toBe(true);
    expect(inWindows(new Date(2026, 6, 10), w)).toBe(false);
  });
  it("refuses to guess at unreadable text", () => {
    expect(seasonWindows("Zone-wide seasons apply", 2026)).toBeNull();
    expect(seasonWindows("", 2026)).toBeNull();
  });
  it("labels windows compactly", () => {
    expect(windowsLabel(seasonWindows("fourth Saturday in April to September 30", 2026))).toBe("Apr 25 – Sep 30");
    expect(cleanSeason("Season: open all year")).toBe("all year");
  });
});

describe("less common wording", () => {
  it("reads numeric ordinals, 'after' and holidays", () => {
    expect(ymd(parseDay("1st Saturday in June", 2026))).toBe("2026-6-6");
    expect(ymd(parseDay("Tuesday after Labour Day", 2026))).toBe("2026-9-8");
    expect(ymd(parseDay("day after Labour Day", 2026))).toBe("2026-9-8");
    expect(ymd(parseDay("Monday after third Sunday in March", 2026))).toBe("2026-3-16");
    expect(ymd(parseDay("Friday after the second Saturday in May", 2026))).toBe("2026-5-15");
    expect(ymd(parseDay("Family Day", 2026))).toBe("2026-2-16");
  });
  it("ignores 'in the following areas' lists", () => {
    expect(seasonWindows("no fishing from March 15 to June 15 in the following areas:Dog Lake - West Township", 2026)).toHaveLength(1);
  });
});
