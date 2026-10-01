import { describe, it, expect } from "vitest";
import { emailProblem, suggestEmail, normalizeEmail } from "./email-validate.js";

describe("emailProblem", () => {
  it("accepts ordinary addresses", () => {
    for (const e of ["a@b.co", "first.last+tag@sub.example.ca", "  Info@MuddyYorkFishing.ca "]) expect(emailProblem(e)).toBeNull();
  });
  it("rejects malformed addresses", () => {
    for (const e of ["", "abc", "a@", "@b.com", "a@b", "a@@b.com", "a b@c.com", "a@b..com", ".a@b.com", "a.@b.com",
      "a..b@c.com", "a@-b.com", "a@b-.com", "a@b.c", "a@b.c0m", "a@b.com.", "a@b,com"]) expect(emailProblem(e), e).toBeTruthy();
  });
  it("flags common provider typos with a suggestion", () => {
    expect(emailProblem("joe@gmial.com")).toMatch(/joe@gmail\.com/);
    expect(suggestEmail("Joe@Hotmail.con")).toBe("joe@hotmail.com");
    expect(suggestEmail("joe@gmail.com")).toBeNull();
  });
  it("normalizes case and whitespace", () => {
    expect(normalizeEmail("  A@B.Com ")).toBe("a@b.com");
  });
});
