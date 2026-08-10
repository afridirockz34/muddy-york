import { describe, it, expect } from "vitest";
import { newNote, hasPin, gmapsPinUrl } from "./notes-model.js";

describe("notes model", () => {
  it("creates a note with id + createdAt and blank defaults", () => {
    const n = newNote({ title: "Forks", technique: "euro nymph" });
    expect(n.id).toBeTruthy();
    expect(n.createdAt).toBeTruthy();
    expect(n.title).toBe("Forks");
    expect(n.technique).toBe("euro nymph");
    expect(n.body).toBe("");
    expect(hasPin(n)).toBe(false);
  });
  it("recognises a GPS pin and builds a maps url", () => {
    const n = newNote({ title: "Run", lat: 43.78, lon: -80.0 });
    expect(hasPin(n)).toBe(true);
    expect(gmapsPinUrl(n)).toContain("43.78");
    expect(gmapsPinUrl(newNote({ title: "x" }))).toBe(null);
  });
});
