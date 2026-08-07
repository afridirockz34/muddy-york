import { describe, it, expect } from "vitest";
import { decodeIdToken } from "../src/routes/google.js";

describe("decodeIdToken", () => {
  it("decodes the JWT payload", () => {
    const payload = Buffer.from(JSON.stringify({ sub: "123", email: "g@x.com" })).toString("base64url");
    const jwt = `h.${payload}.s`;
    expect(decodeIdToken(jwt)).toEqual({ sub: "123", email: "g@x.com" });
  });
});
