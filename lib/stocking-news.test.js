import { describe, it, expect } from "vitest";
import { stockingNews } from "./stocking-news.js";

const feat = (Stocking_Year, Species, Official_Waterbody_Name, Number_of_Fish_Stocked, Unoffcial_Waterbody_Name = null) =>
  ({ attributes: { Stocking_Year, Species, Official_Waterbody_Name, Unoffcial_Waterbody_Name, Number_of_Fish_Stocked } });

describe("stockingNews", () => {
  it("groups by waterbody+species+year and sums counts", () => {
    const json = { features: [
      feat(2025, "Brown Trout", "Credit River", 500),
      feat(2025, "Brown Trout", "Credit River", 300),
    ] };
    const out = stockingNews(json);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ species: "Brown Trout", water: "Credit River", year: 2025, count: 800 });
  });
  it("prioritizes salmonids, then most recent year", () => {
    const json = { features: [
      feat(2026, "Bluegill", "Lake X", 9000),
      feat(2025, "Rainbow Trout", "Bronte Creek", 100),
    ] };
    expect(stockingNews(json).map((x) => x.species)).toEqual(["Rainbow Trout", "Bluegill"]);
  });
  it("filters out years before minYear", () => {
    const json = { features: [feat(2019, "Brown Trout", "Old River", 100), feat(2025, "Brown Trout", "New River", 100)] };
    expect(stockingNews(json, { minYear: 2024 }).map((x) => x.water)).toEqual(["New River"]);
  });
  it("strips the '(Unofficial Name)' suffix and uses the unofficial name when official is null", () => {
    const json = { features: [feat(2025, "Brook Trout", null, 50, "Rabbit Lake (Unofficial Name)")] };
    expect(stockingNews(json)[0].water).toBe("Rabbit Lake");
  });
  it("honours the limit", () => {
    const feats = Array.from({ length: 10 }, (_, i) => feat(2025, "Brown Trout", "River " + i, 100));
    expect(stockingNews({ features: feats }, { limit: 3 })).toHaveLength(3);
  });
});
