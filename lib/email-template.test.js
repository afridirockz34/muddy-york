import { describe, it, expect } from "vitest";
import { renderEmail, stripSignature } from "./email-template.js";

describe("branded email", () => {
  it("wraps the message with the header, button, signature and unsubscribe", () => {
    const { html, text } = renderEmail({ subject: "S", heading: "Hello", text: "Hi Sam,\n\nThe Credit is prime.\n\n- One\n- Two\n\nTight lines,\nOld sign-off", cta: { label: "Open the app", url: "https://muddyyorkfishing.ca/?app" }, unsubscribe: "https://x/unsub" });
    expect(html).toContain("crest.png");
    expect(html).toContain("The Muddy York Fishing team");
    expect(html).toContain("<li");
    expect(html).toContain("Open the app");
    expect(html).toContain("https://x/unsub");
    expect(html).not.toContain("Old sign-off");
    expect(text).toMatch(/Tight lines,\nThe Muddy York Fishing team/);
    expect(text).toContain("Open the app: https://muddyyorkfishing.ca/?app");
    expect(text.match(/Tight lines/g)).toHaveLength(1);
  });
  it("escapes HTML in the message", () => {
    expect(renderEmail({ text: "<script>x</script>" }).html).not.toContain("<script>x");
  });
  it("strips old footers", () => {
    expect(stripSignature("Body\n\n— Muddy York Fishing")).toBe("Body");
  });
});
