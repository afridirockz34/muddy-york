import { describe, it, expect } from "vitest";
import { applySourcePenalty, sourceBadge } from "./scoring-extra.js";

describe("applySourcePenalty", () => {
  it("leaves verified confidence unchanged", () => {
    expect(applySourcePenalty(88, "verified")).toBe(88);
  });
  it("penalizes and caps auto confidence", () => {
    expect(applySourcePenalty(88, "auto")).toBeLessThanOrEqual(70);
    expect(applySourcePenalty(50, "auto")).toBe(35);
  });
});
describe("sourceBadge", () => {
  it("labels each source", () => {
    expect(sourceBadge("verified")).toBe("Verified water");
    expect(sourceBadge("auto")).toBe("Auto-discovered");
  });
});
