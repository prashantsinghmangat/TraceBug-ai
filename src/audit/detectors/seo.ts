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

  out.push(...socialTagFindings(doc), ...structuredDataFindings(doc));
  return out;
}

// ── Social preview (Open Graph / X cards) ──────────────────────────────────
// What Slack, LinkedIn, X, WhatsApp and iMessage show when the link is shared.
// Only what's missing is reported, never "make it better". X falls back to the
// og: tags, so twitter:card alone only decides the large-image layout.

const prop = (doc: Document, p: string): string | null => {
  const el = doc.querySelector(`meta[property="${p}" i], meta[name="${p}" i]`);
  const v = el ? (el.getAttribute("content") || "").trim() : null;
  return v === "" ? null : v;
};

export function socialTagFindings(doc: Document = document): Issue[] {
  const out: Issue[] = [];
  const missing = ["og:title", "og:description", "og:image"].filter((p) => !prop(doc, p));
  if (missing.includes("og:image")) {
    out.push(seoFinding("seo/og-image-missing", "moderate", "No og:image: shared links show no picture",
      "Without an og:image, links to this page shared in Slack, LinkedIn, X or chat apps show a plain text card with no image, which gets far fewer clicks.",
      { evidence: { metrics: { missing: missing.join(", ") } } }));
  }
  const textMissing = missing.filter((p) => p !== "og:image");
  if (textMissing.length) {
    out.push(seoFinding("seo/og-text-missing", "minor", `Missing ${textMissing.join(" and ")}`,
      `Link previews fall back to whatever text the app picks from the page. ${textMissing.join(" and ")} set${textMissing.length === 1 ? "s" : ""} the preview's ${textMissing.map((p) => p.slice(3)).join(" and ")}.`,
      { evidence: { metrics: { missing: textMissing.join(", ") } } }));
  }
  const img = prop(doc, "og:image");
  if (img && !/^https?:\/\//i.test(img)) {
    out.push(seoFinding("seo/og-image-relative", "moderate", "og:image is not an absolute URL",
      `og:image is "${img.slice(0, 80)}". Most link-preview crawlers don't resolve relative URLs, so the image is dropped.`,
      { evidence: { text: img.slice(0, 80) } }));
  }
  if (img && !prop(doc, "twitter:card")) {
    out.push(seoFinding("seo/twitter-card-missing", "minor", "No twitter:card: X shows a small preview",
      'X uses the og: tags, but without <meta name="twitter:card" content="summary_large_image"> it shows the small card with a thumbnail instead of the large image.'));
  }
  return out;
}

// ── Structured data (JSON-LD) ──────────────────────────────────────────────
// Broken JSON-LD fails silently: no error anywhere, the rich result just never
// appears. Only certain failures are reported (JSON that doesn't parse, an
// object with no @type), not "add more recommended fields".

export function structuredDataFindings(doc: Document = document): Issue[] {
  const out: Issue[] = [];
  const blocks = Array.from(doc.querySelectorAll('script[type="application/ld+json" i]'));
  blocks.forEach((s, i) => {
    const text = (s.textContent || "").trim();
    if (!text) return;
    let data: unknown;
    try { data = JSON.parse(text); } catch (err) {
      out.push(seoFinding("seo/structured-data-invalid", "serious", "Structured data (JSON-LD) is not valid JSON",
        `JSON-LD block ${i + 1} of ${blocks.length} doesn't parse (${String((err as Error).message).slice(0, 120)}). Search engines ignore the whole block, so its rich result (stars, FAQ, product details) can't appear.`,
        { evidence: { html: text.slice(0, 600), metrics: { block: i + 1 } } }));
      return;
    }
    const items: unknown[] = Array.isArray(data) ? data : (data as { "@graph"?: unknown[] })?.["@graph"] ?? [data];
    const untyped = items.filter((x) => !x || typeof x !== "object" || !(x as Record<string, unknown>)["@type"]).length;
    if (untyped) {
      out.push(seoFinding("seo/structured-data-untyped", "moderate", "Structured data item has no @type",
        `JSON-LD block ${i + 1} has ${untyped} item${untyped === 1 ? "" : "s"} without "@type", so search engines can't tell what ${untyped === 1 ? "it describes" : "they describe"} and ignore ${untyped === 1 ? "it" : "them"}.`,
        { evidence: { html: text.slice(0, 600), metrics: { block: i + 1, untyped } } }));
    }
  });
  return out;
}

// ── robots.txt and sitemap (one read of each, same site only) ─────────────
// The single most damaging SEO mistake is invisible on the page: robots.txt
// telling crawlers not to fetch it. Checked by reading /robots.txt (and, only
// if robots.txt names no sitemap, /sitemap.xml) from this site. Nothing is
// sent anywhere else. Skipped on development hosts, where it means nothing.

/** Does robots.txt let `agent` fetch `path`? Google's rules: the most specific (longest)
 *  matching Allow/Disallow wins, Allow wins a tie; `*` wildcards and `$` end anchors. */
export function robotsAllows(robotsTxt: string, path: string, agent = "googlebot"): { allowed: boolean; rule?: string } {
  type Group = { agents: string[]; rules: Array<{ allow: boolean; pattern: string }> };
  const groups: Group[] = [];
  let cur: Group | null = null;
  let lastWasAgent = false;
  for (const raw of robotsTxt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase(), val = m[2].trim();
    if (key === "user-agent") {
      if (!cur || !lastWasAgent) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
    } else if ((key === "allow" || key === "disallow") && cur) {
      lastWasAgent = false;
      if (key === "disallow" && val === "") continue; // "Disallow:" with nothing = allow all
      cur.rules.push({ allow: key === "allow", pattern: val });
    } else {
      lastWasAgent = false;
    }
  }
  const a = agent.toLowerCase();
  const specific = groups.filter((g) => g.agents.some((x) => x !== "*" && a.includes(x)));
  const chosen = specific.length ? specific : groups.filter((g) => g.agents.includes("*"));
  const rules = chosen.flatMap((g) => g.rules);
  const toRe = (p: string) => new RegExp("^" + p.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*").replace(/\\\$$/, "$"));
  let best: { allow: boolean; pattern: string } | null = null;
  for (const r of rules) {
    if (!toRe(r.pattern).test(path)) continue;
    if (!best || r.pattern.length > best.pattern.length || (r.pattern.length === best.pattern.length && r.allow)) best = r;
  }
  return best && !best.allow ? { allowed: false, rule: `Disallow: ${best.pattern}` } : { allowed: true };
}

async function fetchText(url: string, ms = 4000): Promise<{ status: number; text: string } | null> {
  const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const t = setTimeout(() => ctl?.abort(), ms);
  try {
    const res = await fetch(url, { credentials: "omit", redirect: "follow", signal: ctl?.signal, cache: "no-cache" });
    const text = res.ok ? (await res.text()).slice(0, 500_000) : "";
    return { status: res.status, text };
  } catch { return null; } finally { clearTimeout(t); }
}

export interface CrawlResult { findings: Issue[]; checked: boolean }

export async function detectCrawlFindings(loc: { origin: string; pathname: string; search: string } = location): Promise<CrawlResult> {
  const out: Issue[] = [];
  const robots = await fetchText(`${loc.origin}/robots.txt`);
  if (!robots) return { findings: out, checked: false };
  const path = loc.pathname + loc.search;
  let sitemapDeclared = false;
  if (robots.status === 200 && robots.text) {
    sitemapDeclared = /^\s*sitemap\s*:/im.test(robots.text);
    const verdict = robotsAllows(robots.text, path);
    if (!verdict.allowed) {
      out.push(seoFinding("seo/robots-blocked", "critical", "robots.txt blocks search engines from this page",
        `${loc.origin}/robots.txt has "${verdict.rule}", which matches ${path}. Google won't crawl the page, so it can't rank — even if the page itself is perfect.`,
        { url: `${loc.origin}/robots.txt`, evidence: { text: verdict.rule } }));
    }
  }
  if (!sitemapDeclared) {
    const sm = await fetchText(`${loc.origin}/sitemap.xml`);
    if (sm && sm.status === 404) {
      out.push(seoFinding("seo/no-sitemap", "minor", "No sitemap found",
        `There's no /sitemap.xml and robots.txt names no sitemap. A sitemap helps search engines find every page, especially new ones and ones with few links to them.`,
        { url: `${loc.origin}/sitemap.xml` }));
    }
  }
  return { findings: out, checked: true };
}
