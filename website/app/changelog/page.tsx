import fs from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SectionHeading from "@/components/SectionHeading";

export const metadata: Metadata = {
  title: "Changelog — TraceBug",
  description: "Every TraceBug release: new capture features, MCP/agent workflow improvements, and fixes.",
};

// Linear-style changelog rendered straight from the repo's CHANGELOG.md at
// build time — one source of truth, no CMS. The parser understands the
// keep-a-changelog shape we already use: `## [version] - date`, optional
// `> intro` blockquote, `### Added/Changed/Fixed` sections, `- ` bullets
// (with continuation lines), and inline **bold** / `code` / [links](url).

type Bullet = { title: string; html: string };
type Section = { name: string; bullets: Bullet[] };
type Release = { version: string; date: string | null; intro: string[]; sections: Section[] };

const SECTION_STYLE: Record<string, string> = {
  Added: "text-success border-success/30 bg-success/10",
  Changed: "text-primary border-primary/30 bg-primary/10",
  Fixed: "text-warning border-warning/30 bg-warning/10",
  Removed: "text-error border-error/30 bg-error/10",
  Security: "text-error border-error/30 bg-error/10",
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inlineMd(s: string): string {
  return escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong class=\"text-text-primary font-semibold\">$1</strong>")
    .replace(/`([^`]+)`/g, "<code class=\"font-mono text-[0.9em] text-text-primary bg-surface-2 border border-border rounded px-1 py-0.5\">$1</code>")
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, "<a class=\"text-primary hover:underline\" href=\"$2\" target=\"_blank\" rel=\"noopener noreferrer\">$1</a>");
}

function parseChangelog(md: string): Release[] {
  const releases: Release[] = [];
  let release: Release | null = null;
  let section: Section | null = null;
  let bulletLines: string[] | null = null;

  const flushBullet = () => {
    if (!bulletLines || !section) { bulletLines = null; return; }
    const text = bulletLines.join(" ").replace(/^-\s+/, "").trim();
    bulletLines = null;
    if (!text) return;
    const m = text.match(/^\*\*(.+?)\*\*\s*(?:—|-|:)?\s*([\s\S]*)$/);
    if (m) section.bullets.push({ title: m[1], html: inlineMd(m[2]) });
    else section.bullets.push({ title: "", html: inlineMd(text) });
  };

  for (const raw of md.split("\n")) {
    const line = raw.trimEnd();
    const rel = line.match(/^## \[(.+?)\](?:\s*-\s*(.+))?$/);
    if (rel) {
      flushBullet();
      section = null;
      release = { version: rel[1], date: rel[2] ?? null, intro: [], sections: [] };
      releases.push(release);
      continue;
    }
    if (!release) continue;
    const sec = line.match(/^### (.+)$/);
    if (sec) {
      flushBullet();
      section = { name: sec[1], bullets: [] };
      release.sections.push(section);
      continue;
    }
    if (line.startsWith("> ")) {
      flushBullet();
      release.intro.push(line.slice(2));
      continue;
    }
    if (line.startsWith("- ")) {
      flushBullet();
      bulletLines = [line];
      continue;
    }
    if (bulletLines && line.trim()) {
      bulletLines.push(line.trim());
      continue;
    }
    if (!line.trim()) flushBullet();
  }
  flushBullet();
  return releases;
}

function loadChangelog(): Release[] {
  for (const p of [path.join(process.cwd(), "..", "CHANGELOG.md"), path.join(process.cwd(), "CHANGELOG.md")]) {
    try {
      if (fs.existsSync(p)) return parseChangelog(fs.readFileSync(p, "utf8"));
    } catch {
      /* fall through */
    }
  }
  return [];
}

export default function ChangelogPage() {
  const releases = loadChangelog();

  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <section className="pt-32 pb-24">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <SectionHeading
            align="left"
            eyebrow="Changelog"
            title="What's new in TraceBug"
            subtitle="Every release, straight from the repo. New capture features, agent-workflow improvements, and the bugs we caught in the bug-catcher."
            className="mb-16"
          />

          <div className="space-y-16">
            {releases.map((rel) => (
              <article key={rel.version} className="relative grid gap-6 lg:grid-cols-[160px_1fr]">
                {/* version rail */}
                <div className="lg:sticky lg:top-24 self-start">
                  <span
                    className={`inline-flex items-center rounded-full border px-3 py-1 font-mono text-[13px] font-semibold ${
                      rel.version === "Unreleased"
                        ? "border-border text-text-muted bg-surface"
                        : "border-primary/30 text-primary bg-primary/10"
                    }`}
                  >
                    {rel.version === "Unreleased" ? "Unreleased" : `v${rel.version}`}
                  </span>
                  <div className="mt-2 text-[12.5px] text-text-subtle">
                    {rel.date ?? (rel.version === "Unreleased" ? "in development" : "")}
                  </div>
                </div>

                {/* content */}
                <div className="min-w-0 border-l border-border pl-6 lg:pl-8">
                  {rel.intro.length > 0 && (
                    <p
                      className="mb-6 text-[15px] leading-relaxed text-text-muted italic"
                      dangerouslySetInnerHTML={{ __html: inlineMd(rel.intro.join(" ")) }}
                    />
                  )}
                  <div className="space-y-8">
                    {rel.sections.map((sec) => (
                      <div key={sec.name}>
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${
                            SECTION_STYLE[sec.name] ?? "text-text-muted border-border bg-surface"
                          }`}
                        >
                          {sec.name}
                        </span>
                        <ul className="mt-4 space-y-5">
                          {sec.bullets.map((b, i) => (
                            <li key={i} className="text-[13.5px] leading-relaxed text-text-muted">
                              {b.title && (
                                <div
                                  className="mb-1 text-[14.5px] font-semibold text-text-primary"
                                  dangerouslySetInnerHTML={{ __html: inlineMd(b.title) }}
                                />
                              )}
                              <span dangerouslySetInnerHTML={{ __html: b.html }} />
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
