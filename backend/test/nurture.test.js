import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "../src/db.js";
import { resetDb } from "./helpers/db.js";
import { runNurture, nudgeCopy } from "../src/nurture/run.js";
import { backfillUsernames } from "../src/auth/username.js";

const good = vi.fn().mockResolvedValue({ airMean: 9, days: 3, flow: "Normal", wind: 8, cloud: 80 });
const thursday = new Date("2026-10-15T12:30:00Z"); // 8:30 a.m. Toronto, a Thursday
const tuesday = new Date("2026-10-13T12:30:00Z");

async function freeUser(email, { views = ["credit-lower"], push = false, daysOld = 3, member = false } = {}) {
  const u = await prisma.user.create({ data: { email, displayName: email.split("@")[0], createdAt: new Date(tuesday - daysOld * 864e5),
    trialEnd: member ? new Date(tuesday.getTime() + 5 * 864e5) : null } });
  for (const ref of views) await prisma.event.create({ data: { userId: u.id, type: "view_reach", ref, createdAt: new Date(tuesday - 2 * 864e5) } });
  if (push) await prisma.pushSubscription.create({ data: { userId: u.id, endpoint: "https://push.example/" + email, p256dh: "x", auth: "y" } });
  return u;
}

describe("free-member nudges", () => {
  beforeEach(async () => { await resetDb(); });
  afterAll(() => prisma.$disconnect());

  it("pushes on a prime day for a river they viewed, at most twice a week", async () => {
    await freeUser("a@b.com", { push: true });
    const sendPush = vi.fn().mockResolvedValue(true), sendEmail = vi.fn().mockResolvedValue(true);
    const scoreHigh = vi.fn().mockResolvedValue({ airMean: 9, days: 2, flow: "Normal", wind: 5, cloud: 90 });
    let total = 0;
    for (let d = 0; d < 5; d++) total += (await runNurture({ now: new Date(tuesday.getTime() + d * 864e5), fetchWeather: scoreHigh, sendPush, sendEmail })).pushes;
    // Only counts if the river actually scored prime in this weather.
    const copy = nudgeCopy({ displayName: "a" }, [{ river: "Credit River", section: "Lower", score: 82 }], { hadTrial: false });
    expect(copy.push.title).toMatch(/Credit River is excellent today/);
    expect(total).toBeLessThanOrEqual(2);
  });

  it("emails the Thursday roundup once a week, with an unsubscribe-safe opt-out", async () => {
    const u = await freeUser("e@b.com");
    const sendEmail = vi.fn().mockResolvedValue(true);
    const low = vi.fn().mockResolvedValue({ airMean: 26, days: 9, flow: "Low / clear", wind: 30, cloud: 0 });
    expect((await runNurture({ now: tuesday, fetchWeather: low, sendEmail })).emails).toBe(0);   // not prime, not Thursday
    expect((await runNurture({ now: thursday, fetchWeather: low, sendEmail })).emails).toBe(1);
    expect(sendEmail.mock.calls[0][0].text).toContain("Credit River");
    expect((await runNurture({ now: new Date(thursday.getTime() + 3600e3), fetchWeather: low, sendEmail })).emails).toBe(0);
    await prisma.user.update({ where: { id: u.id }, data: { emailOptOut: true, nurtureEmailAt: null } });
    expect((await runNurture({ now: thursday, fetchWeather: low, sendEmail })).emails).toBe(0);
  });

  it("leaves members, dormant and brand-new accounts alone", async () => {
    await freeUser("m@b.com", { member: true });
    const n = await freeUser("n@b.com");
    await prisma.user.update({ where: { id: n.id }, data: { createdAt: new Date(thursday.getTime() - 3600e3) } });
    const d = await freeUser("d@b.com");
    await prisma.event.updateMany({ where: { userId: d.id }, data: { createdAt: new Date(thursday - 70 * 864e5) } });
    const sendEmail = vi.fn().mockResolvedValue(true);
    expect((await runNurture({ now: thursday, fetchWeather: good, sendEmail })).emails).toBe(0);
  });

  it("only sends between 7 and 9 a.m.", async () => {
    expect((await runNurture({ now: new Date("2026-10-15T20:00:00Z"), fetchWeather: good })).skipped).toBeTruthy();
  });
});

describe("usernames", () => {
  beforeEach(resetDb);
  it("gives every account a placeholder, never from the email", async () => {
    await prisma.user.create({ data: { email: "jane.doe@example.com" } });
    expect(await backfillUsernames()).toBe(1);
    const u = await prisma.user.findFirst();
    expect(u.displayName).toMatch(/^angler\d+$/);
    expect(u.usernameChosen).toBe(false);
  });
});
