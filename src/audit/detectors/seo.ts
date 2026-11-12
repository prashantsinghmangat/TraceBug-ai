// ── SEO checks (page level) ────────────────────────────────────────────────
// docs/audit-quality/implementation-plan.md §4: title, meta description,
// canonical, H1 count, robots noindex, viewport meta. Single page, no crawl,
// no ranking claims. `lang` and image alt text are left to the accessibility
// scan (axe's html-has-lang / image-alt), so one problem is reported once.
//
// Reads only the document, so it is testable in jsdom.

import type { Issue, IssueSeverity } from "../../types";
import { makeIssueId } from "../../scanner/helpers";
import { elementEvidence } from "./evidence";

export const SEO_LIMITS = { titleMin: 10, titleMax: 60, descMin: 50, descMax: 160 };

function seoFinding(ruleId: string, severity: IssueSeverity, title: string, description: string, extra: Partial<Issue> = {}): Issue {
  return {
    id: makeIssueId("audit-seo"),
    detector: "audit-seo",
    category: "seo",
    ruleId,
    severity,
    title,
    description,
    page: typeof location !== "undefined" ? location.href : "",
    detectedAt: Date.now(),
    ...extra,
  };
}

const metaContent = (doc: Document, name: string): string | null => {
  const el = doc.querySelector(`meta[name="${name}" i]`);
  return el ? (el.getAttribute("content") || "").trim() : null;
};

export function detectSeoFindings(doc: Document = document): Issue[] {
  const out: Issue[] = [];
  const { titleMin, titleMax, descMin, descMax } = SEO_LIMITS;

  // <title>
  const title = (doc.querySelector("head > title, title")?.textContent || "").replace(/\s+/g, " ").trim();
  if (!title) {
    out.push(seoFinding("seo/missing-title", "serious", "Page has no <title>",
      "Search results and browser tabs show the page title. Add a <title> in <head> that names the page."));
  } else if (title.length < titleMin || title.length > titleMax) {
    out.push(seoFinding("seo/title-length", "minor", `Title is ${title.length} characters`,
      `Search results show roughly ${titleMax} characters. ${title.length > titleMax ? "The end will be cut off." : "A very short title rarely says what the page is."} Aim for ${titleMin}–${titleMax}.`,
      { evidence: { text: title, metrics: { length: title.length } } }));
  }

  // meta description
  const desc = metaContent(doc, "description");
  if (desc === null || desc === "") {
    out.push(seoFinding("seo/missing-description", "moderate", "No meta description",
      'Search engines use <meta name="description"> for the snippet under the title; without it they pick page text themselves.'));
  } else if (desc.length < descMin || desc.length > descMax) {
    out.push(seoFinding("seo/description-length", "minor", `Meta description is ${desc.length} characters`,
      `Snippets show roughly ${descMax} characters. Aim for ${descMin}–${descMax}.`,
      { evidence: { text: desc.slice(0, 200), metrics: { length: desc.length } } }));
  }

  // canonical
  const canonicals = Array.from(doc.querySelectorAll('link[rel~="canonical" i]'));
  if (canonicals.length === 0) {
    out.push(seoFinding("seo/missing-canonical", "minor", "No canonical URL",
      'Without <link rel="canonical">, the same page reached with different query strings can be indexed as separate pages.'));
  } else if (canonicals.length > 1) {
    out.push(seoFinding("seo/multiple-canonical", "moderate", `${canonicals.length} canonical links`,
      "Search engines ignore conflicting canonical links. Keep exactly one.",
      { evidence: { hints: canonicals.map((c) => c.getAttribute("href") || "").filter(Boolean) } }));
  }

  // H1
  const h1s = Array.from(doc.querySelectorAll("h1")).filter((h) => !h.closest("#tracebug-root"));
  if (h1s.length === 0) {
    out.push(seoFinding("seo/missing-h1", "moderate", "Page has no <h1>",
      "The main heading tells search engines and screen-reader users what the page is about. Add one <h1>."));
  } else if (h1s.length > 1) {
    out.push(seoFinding("seo/multiple-h1", "minor", `Page has ${h1s.length} <h1> headings`,
      "Use one <h1> for the page's main topic and <h2>–<h6> below it.",
      { selector: "h1", evidence: { ...elementEvidence(h1s[1]), metrics: { count: h1s.length } } }));
  }

  // robots noindex — reported as a finding, not an error: it may be deliberate.
  const robots = (metaContent(doc, "robots") || "") + "," + (metaContent(doc, "googlebot") || "");
  if (/\bnoindex\b/i.test(robots)) {
    out.push(seoFinding("seo/noindex", "serious", "Page tells search engines not to index it",
      'A robots meta tag says "noindex". Correct for staging or private pages; on a public page it keeps it out of search.',
      { evidence: { text: robots.replace(/^,|,$/g, "") } }));
  }

  // viewport
  if (!doc.querySelector('meta[name="viewport" i]')) {
    out.push(seoFinding("seo/missing-viewport", "serious", "No viewport meta tag",
      'Without <meta name="viewport" content="width=device-width, initial-scale=1">, phones render the page at desktop width, zoomed out.'));
  }

  return out;
}
