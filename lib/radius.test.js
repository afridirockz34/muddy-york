import { describe, it, expect } from "vitest";
import { RADIUS_PRESETS, radiusLabel } from "./radius.js";

describe("radius", () => {
  it("has presets and labels a value", () => {
    expect(RADIUS_PRESETS.length).toBe(4);
    expect(radiusLabel(120000)).toBe("120 km");
    expect(radiusLabel(30000)).toBe("30 km");
    expect(radiusLabel(70000)).toBe("60 km");
  });
});
