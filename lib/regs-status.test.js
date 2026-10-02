import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { parseZonePage, textFragmentUrl, zoneUrl } from "./regs-parse.js";
import { resolveReach, statusFor, covers } from "./regs-status.js";
import { REACH_REGS } from "./regs-reaches.js";

const html = fs.readFileSync(new URL("./fixtures/fmz16-excerpt.html", import.meta.url), "utf8");
const z16 = parseZonePage(html, 16);

describe("parseZonePage", () => {
  it("reads zone-wide seasons and limits", () => {
    const rbt = z16.zoneWide.find((z) => z.species === "Rainbow trout");
    expect(rbt.season).toBe("fourth Saturday in April to September 30");
    expect(rbt.limits).toBe("S-2 and C-1");
  });
  it("reads species exceptions as groups of waters with a season", () => {
    expect(z16.speciesExceptions).toHaveLength(2);
    expect(z16.speciesExceptions[0].season).toBe("open all year");
    expect(z16.speciesExceptions[1].season).toMatch(/^open from fourth Saturday in April to December 31/);
    expect(z16.speciesExceptions[0].waters[0].name).toBe("Credit River and tributaries");
  });
  it("reads waterbody exceptions with their rules verbatim", () => {
    const e = z16.waterbody[0];
    expect(e.name).toBe("Credit River");
    expect(e.location).toMatch(/^and tributaries - from the south side of the Highway 403 bridge/);
    expect(e.rules[0]).toMatch(/^Fish sanctuary - no fishing from January 1/);
    expect(z16.waterbody[1].rules).toContain("Only 1 single-pointed barbless hook may be used");
  });
  it("reads sanctuaries and marks cross-references", () => {
    expect(z16.sanctuaries[0].waters[0].seeExceptions).toBe(true);
    expect(z16.sanctuaries[1].waters[0].text).toContain("Denny’s Dam");
  });
  it("rejects pages that don't look like a zone page", () => {
    expect(parseZonePage("<html><h2>General information</h2><p>Maintenance</p></html>", 16)).toBeNull();
    expect(parseZonePage("<html>nothing</html>", 16)).toBeNull();
  });
});

describe("textFragmentUrl", () => {
  it("links short passages whole and long ones by start and end", () => {
    expect(textFragmentUrl(zoneUrl(16), "Bells Lake - Grey")).toBe(`${zoneUrl(16)}#:~:text=Bells%20Lake%20%2D%20Grey`);
    const long = textFragmentUrl(zoneUrl(16), z16.waterbody[0].text);
    expect(long).toMatch(/#:~:text=Credit%20River%20and%20tributaries%20%2D%20from%20the%20south,/);
    expect(long).toMatch(/Village%20of%20Streetsville$/);
  });
});

describe("statusFor (Credit River, lower)", () => {
  const bundle = resolveReach("credit-lower", { 16: z16 });
  const at = (iso) => statusFor(bundle, ["STL", "CHN", "BNTr", "ATS"], new Date(iso));

  it("matches every mapped entry", () => {
    expect(bundle.stretches.every((s) => s.unmatched.length === 0)).toBe(true);
  });
  it("is open below Hwy 403 all year, closed above it after Aug 15", () => {
    const s = at("2026-10-01T12:00:00");
    expect(s.state).toBe("varies");
    expect(s.stretches[0].state).toBe("open");
    expect(s.stretches[1].state).toBe("closed");
  });
  it("is open on both stretches in June", () => {
    expect(at("2026-06-10T12:00:00").state).toBe("open");
  });
  it("links each official entry to its exact place on ontario.ca", () => {
    const e = bundle.stretches[1].entries[0];
    expect(e.link.startsWith(zoneUrl(16) + "#:~:text=")).toBe(true);
  });
});

describe("statusFor safety", () => {
  it("says check when a mapping no longer matches the official text", () => {
    const reworded = { ...z16, waterbody: [] };
    const s = statusFor(resolveReach("credit-lower", { 16: reworded }), ["STL"], new Date("2026-06-10T12:00:00"));
    expect(s.stretches[1].unmatched).toBe(1);
    expect(s.stretches[1].state).toBe("check");
  });
  it("applies catch-and-release notes only to the species named", () => {
    const s = statusFor(resolveReach("credit-upper", { 16: z16 }), ["BKT", "BNT"], new Date("2026-06-10T12:00:00"));
    const notes = s.stretches[0].species.flatMap((x) => x.notes);
    expect(notes.some((n) => /Catch-and-release/.test(n))).toBe(true);
    expect(notes).toContain("Only artificial lures may be used");
  });
  it("understands 'All species (except …)'", () => {
    expect(covers("All species (except Largemouth and Smallmouth Bass, Northern Pike)", "Rainbow trout")).toBe(true);
    expect(covers("All species (except Largemouth and Smallmouth Bass, Northern Pike)", "Northern pike")).toBe(false);
  });
  it("maps every app river section", () => {
    for (const id of ["credit-lower", "grand-tw", "ganaraska", "niagara-lower", "sauble"]) expect(REACH_REGS[id]).toBeTruthy();
  });
});
