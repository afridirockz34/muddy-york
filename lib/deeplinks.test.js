import { describe, it, expect } from "vitest";
import { gmapsDirections, gmapsPin } from "./deeplinks.js";

describe("google maps deep links", () => {
  it("builds a driving directions url to a destination", () => {
    expect(gmapsDirections(43.71, -80.37)).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=43.71%2C-80.37&travelmode=driving"
    );
  });
  it("supports a walking travel mode", () => {
    expect(gmapsDirections(43.71, -80.37, "walking")).toContain("travelmode=walking");
  });
  it("builds a search pin url", () => {
    expect(gmapsPin(43.71, -80.37)).toBe(
      "https://www.google.com/maps/search/?api=1&query=43.71%2C-80.37"
    );
  });
});
