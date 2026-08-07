import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { resetDb } from "./helpers/db.js";

const app = buildApp();
const cookieName = process.env.SESSION_COOKIE_NAME || "my_session";
async function signup(email) {
  const s = await app.inject({ method: "POST", url: "/auth/signup", payload: { email, password: "supersecret1" } });
  return s.cookies.find((c) => c.name === cookieName).value;
}
const spot = { ref: "grand-tw", river: "Grand River", section: "Tailwater", lat: 43.71, lon: -80.37,
  source: "verified", habitat: { hold:88,struct:80,spawn:70,cold:95,ox:86,gw:60 }, species: ["BNT","RBT"], history: 90 };

describe("saved-spots + alert-prefs", () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  it("401s unauthenticated", async () => {
    expect((await app.inject({ method: "GET", url: "/saved-spots" })).statusCode).toBe(401);
  });
  it("saves, lists, and deletes a spot", async () => {
    const token = await signup("s@b.com");
    const c = { [cookieName]: token };
    const save = await app.inject({ method: "POST", url: "/saved-spots", cookies: c, payload: spot });
    expect(save.statusCode).toBe(200);
    const list = await app.inject({ method: "GET", url: "/saved-spots", cookies: c });
    expect(list.json().spots).toHaveLength(1);
    expect(list.json().spots[0].ref).toBe("grand-tw");
    await app.inject({ method: "POST", url: "/saved-spots", cookies: c, payload: spot });
    expect((await app.inject({ method: "GET", url: "/saved-spots", cookies: c })).json().spots).toHaveLength(1);
    const del = await app.inject({ method: "DELETE", url: "/saved-spots/grand-tw", cookies: c });
    expect(del.statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/saved-spots", cookies: c })).json().spots).toHaveLength(0);
  });
  it("reads and updates alert prefs", async () => {
    const token = await signup("p@b.com");
    const c = { [cookieName]: token };
    expect((await app.inject({ method: "GET", url: "/alert-prefs", cookies: c })).json()).toMatchObject({ alertEmail: true, alertThreshold: 75 });
    await app.inject({ method: "PUT", url: "/alert-prefs", cookies: c, payload: { alertEmail: false, alertThreshold: 85 } });
    expect((await app.inject({ method: "GET", url: "/alert-prefs", cookies: c })).json()).toMatchObject({ alertEmail: false, alertThreshold: 85 });
  });
});
