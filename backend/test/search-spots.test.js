import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "../src/db.js";
import { resetDb } from "./helpers/db.js";

const { buildApp } = await import("../src/app.js");
const app = buildApp();
const reach = (name, lat, lon) => ({ id: `r:${name}:${lat}`, name, lat, lon, waterType: "river", kind: "reach", near: "Glen Williams" });

describe("river search", () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  it("finds every stored spot on a river across tiles, by stretch", async () => {
    await prisma.mapDataCache.createMany({ data: [
      { key: "tile1:174:-319", data: { spots: [reach("Credit River", 43.55, -79.62), reach("Credit River", 43.62, -79.7), reach("Humber River", 43.7, -79.5)] }, fetchedAt: new Date() },
      { key: "tile1:175:-320", data: { spots: [reach("Credit River", 43.75, -79.88), { id: "n9", name: "Credit River access", river: "Credit River", lat: 43.7, lon: -79.8, kind: "access", waterType: "river" }] }, fetchedAt: new Date() },
      { key: "disc2:other", data: { spots: [reach("Credit River", 40, -70)] }, fetchedAt: new Date() },
    ] });
    const r = await app.inject({ method: "GET", url: "/api/search-spots?q=credit%20rivers" });
    expect(r.statusCode).toBe(200);
    const { waters } = r.json();
    expect(waters).toHaveLength(1);
    expect(waters[0].name).toBe("Credit River");
    expect(waters[0].spots).toHaveLength(4);
    expect(waters[0].spots.some((s) => s.kind === "access")).toBe(true);
    expect((await app.inject({ method: "GET", url: "/api/search-spots?q=r" })).json()).toEqual({ waters: [] });
  });
});
