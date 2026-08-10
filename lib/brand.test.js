import { describe, it, expect } from "vitest";
import { ICON_NAMES, iconPath } from "./brand.jsx";

describe("icon registry", () => {
  it("every declared name has a path", () => {
    for (const n of ICON_NAMES) expect(typeof iconPath(n)).toBe("string");
    expect(ICON_NAMES.length).toBeGreaterThan(15);
  });
  it("unknown name returns empty", () => {
    expect(iconPath("nope")).toBe("");
  });
});
