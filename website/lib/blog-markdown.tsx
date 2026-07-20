import { type ReactNode } from "react";

// Minimal markdown renderer for blog content — exactly the subset our posts
// (and any future backend content) use: ## headings, paragraphs, ``` fences,
// **bold**, `inline code`, [links](url), ![images](src) as their own block,
// and flat "- " lists. Deliberately no dependency: the grammar is small and
// this keeps the payload at zero.

const P = "mb-4 text-[15px] leading-[1.75] text-text-muted";
const H2 = "mt-10 mb-3 text-[22px] font-semibold tracking-[-0.02em] text-text-primary";
const CODE =
  "rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[13px] text-text-primary";

function renderInline(text: string, keyBase: string): ReactNode[] {
  // Split on links, bold, and inline code — longest-match, non-nested (our
  // content doesn't nest these).
  const parts = text.split(/(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    const key = `${keyBase}-${i}`;
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      const external = link[2].startsWith("http");
      return (
        <a
          key={key}
          href={link[2]}
          className="text-primary hover:underline"
          {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        >
          {link[1]}
        </a>
      );
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={key} className="font-semibold text-text-primary">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={key} className={CODE}>
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

export function renderMarkdown(md: string): ReactNode[] {
  const blocks: ReactNode[] = [];
  // Fences first, so their content is never treated as paragraphs.
  const segments = md.split(/```(?:\w*)\n?([\s\S]*?)```/g);
  segments.forEach((segment, si) => {
    if (si % 2 === 1) {
      blocks.push(
        <pre key={`fence-${si}`} className="code-block mb-4 overflow-x-auto p-4 text-[13px] text-text-primary">
          {segment.trim()}
        </pre>
      );
      return;
    }
    segment.split(/\n{2,}/).forEach((block, bi) => {
      const trimmed = block.trim();
      if (!trimmed) return;
      const key = `b-${si}-${bi}`;
      if (trimmed.startsWith("## ")) {
        blocks.push(
          <h2 key={key} className={H2}>
            {renderInline(trimmed.slice(3), key)}
          </h2>
        );
      } else if (/^!\[[^\]]*\]\([^)]+\)$/.test(trimmed)) {
        // Block-level image: a line that is exactly ![alt](src)
        const img = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/)!;
        blocks.push(
          <figure key={key} className="my-7">
            {/* eslint-disable-next-line @next/next/no-img-element -- author-controlled static asset */}
            <img
              src={img[2]}
              alt={img[1]}
              loading="lazy"
              className="w-full rounded-2xl border border-border"
            />
            {img[1] ? (
              <figcaption className="mt-2 text-center text-[12.5px] text-text-subtle">{img[1]}</figcaption>
            ) : null}
          </figure>
        );
      } else if (trimmed.split("\n").every((l) => l.trim().startsWith("- "))) {
        // Flat unordered list: every line of the block starts with "- "
        blocks.push(
          <ul key={key} className="mb-4 list-disc space-y-1.5 pl-5 text-[15px] leading-[1.75] text-text-muted">
            {trimmed.split("\n").map((l, li) => (
              <li key={`${key}-${li}`}>{renderInline(l.trim().slice(2), `${key}-${li}`)}</li>
            ))}
          </ul>
        );
      } else {
        blocks.push(
          <p key={key} className={P}>
            {renderInline(trimmed, key)}
          </p>
        );
      }
    });
  });
  return blocks;
}
