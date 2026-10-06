import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "../src/db.js";
import { resetDb } from "./helpers/db.js";
import { runAlerts } from "../src/alerts/run.js";

const habitat = { hold:88,struct:80,spawn:70,cold:95,ox:86,gw:60 };

describe("runAlerts", () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  it("emails once for a prime spot and de-dups on the next run", async () => {
    const user = await prisma.user.create({ data: { email: "r@b.com", alertEmail: true, alertThreshold: 60 } });
    await prisma.savedSpot.create({ data: { userId: user.id, ref: "x", river: "R", section: "S",
      lat: 43.7, lon: -80.3, habitat, species: ["BNT"], history: 90 } });
    const fetchWeather = vi.fn().mockResolvedValue({ airMean: 10, days: 4, flow: "Normal" });
    const sendEmail = vi.fn().mockResolvedValue(true);
    const now = new Date("2026-05-15T12:00:00Z");
    const r1 = await runAlerts({ now, fetchWeather, sendEmail });
    expect(r1.sent).toBe(1);
    const r2 = await runAlerts({ now, fetchWeather, sendEmail });
    expect(r2.sent).toBe(0);
  });

  it("stays quiet while a river stays prime, even days later", async () => {
    const user = await prisma.user.create({ data: { email: "q@b.com", alertEmail: true, alertThreshold: 60 } });
    await prisma.savedSpot.create({ data: { userId: user.id, ref: "q", river: "R", section: "S",
      lat: 43.7, lon: -80.3, habitat, species: ["BNT"], history: 90 } });
    const fetchWeather = vi.fn().mockResolvedValue({ airMean: 10, days: 4, flow: "Normal" });
    const sendEmail = vi.fn().mockResolvedValue(true);
    let total = 0;
    for (let h = 0; h < 72; h += 1) {
      total += (await runAlerts({ now: new Date(Date.parse("2026-05-15T12:00:00Z") + h * 3600000), fetchWeather, sendEmail })).sent;
    }
    expect(total).toBe(1);
  });

  it("bundles several prime rivers into one message", async () => {
    const user = await prisma.user.create({ data: { email: "m@b.com", alertEmail: true, alertThreshold: 60 } });
    for (const ref of ["a", "b", "c"]) await prisma.savedSpot.create({ data: { userId: user.id, ref, river: "R" + ref, section: "S",
      lat: 43.7, lon: -80.3, habitat, species: ["BNT"], history: 90 } });
    const sendEmail = vi.fn().mockResolvedValue(true);
    const r = await runAlerts({ now: new Date("2026-05-15T12:00:00Z"),
      fetchWeather: vi.fn().mockResolvedValue({ airMean: 10, days: 4, flow: "Normal" }), sendEmail });
    expect(r.sent).toBe(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][3]).toHaveLength(2);
  });

  it("skips users with alertEmail off", async () => {
    const user = await prisma.user.create({ data: { email: "o@b.com", alertEmail: false, alertThreshold: 10 } });
    await prisma.savedSpot.create({ data: { userId: user.id, ref: "y", river: "R", section: "S",
      lat: 43.7, lon: -80.3, habitat, species: ["BNT"], history: 90 } });
    const r = await runAlerts({ now: new Date("2026-05-15T12:00:00Z"),
      fetchWeather: vi.fn().mockResolvedValue({ airMean: 10, days: 4, flow: "Normal" }), sendEmail: vi.fn() });
    expect(r.sent).toBe(0);
  });
});
