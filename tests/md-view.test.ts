import { describe, it, expect } from "vitest";
import { renderMarkdownView } from "../src/ui/md-view";

describe("ticket description read view", () => {
  it("shows the report builder's markdown as formatted text, no raw symbols", () => {
    const html = renderMarkdownView([
      "> 🔍 Possible Cause (high confidence): API POST / failed with Network Error",
      "",
      "**Summary:** API POST / failed on /time/day/2026",
      "",
      "**Steps to reproduce:**",
      "1. Open the page",
      "2. Click `Save`",
    ].join("\n"));
    expect(html).toContain('<div class="md-quote">🔍 Possible Cause');
    expect(html).toContain("<strong>Summary:</strong> API POST");
    expect(html).toContain("<ol><li>Open the page</li><li>Click <code>Save</code></li></ol>");
    expect(html).not.toContain("**");
    expect(html).not.toMatch(/&gt; 🔍/);
  });

  it("escapes everything — page text can never become markup", () => {
    const html = renderMarkdownView('<img src=x onerror=alert(1)> **<b>x</b>** `<script>`');
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("drops link targets and keeps the text", () => {
    const html = renderMarkdownView("See [the docs](javascript:alert(1)) now");
    expect(html).toBe("<p>See the docs now</p>");
  });

  it("handles headings, bullets, code blocks and rules", () => {
    const html = renderMarkdownView("## Env\n- Chrome\n- Windows\n\n```\nTypeError: x\n```\n---");
    expect(html).toContain('<div class="md-h md-h2">Env</div>');
    expect(html).toContain("<ul><li>Chrome</li><li>Windows</li></ul>");
    expect(html).toContain("<pre><code>TypeError: x</code></pre>");
    expect(html).toContain("<hr>");
  });

  it("italicises _placeholders_ but leaves snake_case alone", () => {
    expect(renderMarkdownView("**Expected:** _(what should happen)_")).toBe("<p><strong>Expected:</strong> <em>(what should happen)</em></p>");
    expect(renderMarkdownView("see user_id and max_len")).toBe("<p>see user_id and max_len</p>");
  });

  it("returns empty for an empty description", () => {
    expect(renderMarkdownView("")).toBe("");
  });
});
