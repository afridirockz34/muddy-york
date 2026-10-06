import { describe, it, expect } from "vitest";
import { renderMarkdown, markdownText } from "./markdown.js";

describe("renderMarkdown", () => {
  it("renders headings, paragraphs, emphasis and lists", () => {
    const html = renderMarkdown("## Gear\n\nUse **egg** patterns and *light* tippet.\n\n- 9 ft rod\n- floating line\n\n1. Read water\n2. Drift");
    expect(html).toContain("<h2>Gear</h2>");
    expect(html).toContain("<p>Use <strong>egg</strong> patterns and <em>light</em> tippet.</p>");
    expect(html).toContain("<ul><li>9 ft rod</li><li>floating line</li></ul>");
    expect(html).toContain("<ol><li>Read water</li><li>Drift</li></ol>");
  });
  it("renders links and images, marking external links", () => {
    const html = renderMarkdown("See [the regs](https://www.ontario.ca/x) and [rivers](/rivers/).\n\n![A steelhead](https://res.cloudinary.com/a.jpg)");
    expect(html).toContain('<a href="https://www.ontario.ca/x" target="_blank" rel="noopener noreferrer">the regs</a>');
    expect(html).toContain('<a href="/rivers/">rivers</a>');
    expect(html).toContain('<img src="https://res.cloudinary.com/a.jpg" alt="A steelhead" loading="lazy"/>');
  });
  it("escapes raw HTML and refuses unsafe URLs", () => {
    const html = renderMarkdown('<script>alert(1)</script>\n\n[x](javascript:alert(1)) ![y](data:image/png;base64,AA) [z](//evil.com)');
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toMatch(/href="javascript/);
    expect(html).not.toMatch(/src="data:/);
    expect(html).not.toMatch(/href="\/\/evil/);
  });
  it("merges quote lines and renders rules", () => {
    const html = renderMarkdown("> one\n> two\n\n---");
    expect(html).toContain("<blockquote><p>one</p>\n<p>two</p></blockquote>");
    expect(html).toContain("<hr/>");
  });
});

describe("markdownText", () => {
  it("strips syntax to plain text", () => {
    expect(markdownText("## Hi\n\n**Bold** [link](/x) ![img](/y.jpg)\n- item")).toBe("Hi Bold link item");
  });
});

describe("tables", () => {
  it("renders a pipe table with header and rows", async () => {
    const { renderMarkdown } = await import("./markdown.js");
    const html = renderMarkdown("| A | B |\n|---|---|\n| 1 | **2** |\n\nafter");
    expect(html).toContain("<thead><tr><th>A</th><th>B</th></tr></thead>");
    expect(html).toContain("<td><strong>2</strong></td>");
    expect(html).toContain("<p>after</p>");
  });
});
