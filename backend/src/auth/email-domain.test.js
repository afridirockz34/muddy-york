import { describe, it, expect } from "vitest";
import { domainAcceptsMail } from "./email-domain.js";

const err = (code) => Object.assign(new Error(code), { code });
const fake = ({ mx, a }) => ({
  resolveMx: async () => { if (mx instanceof Error) throw mx; return mx; },
  resolve4: async () => { if (a instanceof Error) throw a; return a; },
});

describe("domainAcceptsMail", () => {
  it("is true when the domain has MX records", async () => {
    expect(await domainAcceptsMail("x@good.ca", { resolver: fake({ mx: [{ exchange: "mx.good.ca", priority: 10 }] }) })).toBe(true);
  });
  it("falls back to an address record when there is no MX", async () => {
    expect(await domainAcceptsMail("x@good.ca", { resolver: fake({ mx: err("ENODATA"), a: ["1.2.3.4"] }) })).toBe(true);
  });
  it("is false for a domain that doesn't exist", async () => {
    expect(await domainAcceptsMail("x@nope.invalid", { resolver: fake({ mx: err("ENOTFOUND"), a: err("ENOTFOUND") }) })).toBe(false);
  });
  it("is false for a null MX with no address record", async () => {
    expect(await domainAcceptsMail("x@nomail.ca", { resolver: fake({ mx: [{ exchange: "." }], a: err("ENODATA") }) })).toBe(false);
  });
  it("never blocks on our own DNS trouble", async () => {
    expect(await domainAcceptsMail("x@good.ca", { resolver: fake({ mx: err("ETIMEOUT"), a: err("ETIMEOUT") }) })).toBe(true);
    const slow = { resolveMx: () => new Promise(() => {}), resolve4: () => new Promise(() => {}) };
    expect(await domainAcceptsMail("x@good.ca", { resolver: slow, timeoutMs: 20 })).toBe(true);
  });
});
