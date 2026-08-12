import { describe, it, expect } from "vitest";
import { signaturePayload, cloudinarySignature } from "./cloudinary-sign.js";

// deterministic fake hasher for assertions
const fakeSha1 = (s) => "sha1(" + s + ")";

describe("signaturePayload", () => {
  it("sorts keys and joins as k=v with &", () => {
    expect(signaturePayload({ timestamp: 100, folder: "x" })).toBe("folder=x&timestamp=100");
  });
  it("is order-independent in the input object", () => {
    const a = signaturePayload({ b: 2, a: 1, c: 3 });
    const b = signaturePayload({ c: 3, a: 1, b: 2 });
    expect(a).toBe(b);
  });
  it("drops empty/undefined/null values", () => {
    expect(signaturePayload({ a: 1, b: "", c: undefined, d: null })).toBe("a=1");
  });
});

describe("cloudinarySignature", () => {
  it("appends the secret then hashes the payload", () => {
    expect(cloudinarySignature({ folder: "f", timestamp: 5 }, "SECRET", fakeSha1))
      .toBe("sha1(folder=f&timestamp=5SECRET)");
  });
  it("matches Cloudinary's real sha1 scheme", async () => {
    const { createHash } = await import("node:crypto");
    const sha1 = (s) => createHash("sha1").update(s).digest("hex");
    // Known vector: params folder=test&timestamp=1315060510 + secret abcd
    const sig = cloudinarySignature({ timestamp: 1315060510, folder: "test" }, "abcd", sha1);
    expect(sig).toBe(sha1("folder=test&timestamp=1315060510abcd"));
    expect(sig).toMatch(/^[0-9a-f]{40}$/);
  });
});
