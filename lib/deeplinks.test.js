import { describe, it, expect } from "vitest";
import { gmapsDirections, appleMapsDirections, isIOS, directionsUrl, gmapsPin, gImages } from "./deeplinks.js";

describe("google maps deep links", () => {
  it("builds a driving directions url to a destination", () => {
    expect(gmapsDirections(43.71, -80.37)).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=43.71%2C-80.37&travelmode=driving"
    );
  });
  it("supports a walking travel mode", () => {
    expect(gmapsDirections(43.71, -80.37, "walking")).toContain("travelmode=walking");
  });
  it("builds a search pin url", () => {
    expect(gmapsPin(43.71, -80.37)).toBe(
      "https://www.google.com/maps/search/?api=1&query=43.71%2C-80.37"
    );
  });
  it("builds a google images search url for a fly name", () => {
    expect(gImages("Elk Hair Caddis fly")).toBe(
      "https://www.google.com/search?tbm=isch&q=Elk%20Hair%20Caddis%20fly"
    );
  });
  it("builds an apple maps directions url", () => {
    expect(appleMapsDirections(43.71, -80.37)).toBe("https://maps.apple.com/?daddr=43.71%2C-80.37&dirflg=d");
  });
  it("detects iOS from a user agent string", () => {
    expect(isIOS("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe(true);
    expect(isIOS("Mozilla/5.0 (Linux; Android 14)")).toBe(false);
  });
  it("directionsUrl uses Apple Maps on iOS and Google elsewhere", () => {
    expect(directionsUrl(43.71, -80.37, "iPhone")).toContain("maps.apple.com");
    expect(directionsUrl(43.71, -80.37, "Android")).toContain("google.com/maps");
  });
});
