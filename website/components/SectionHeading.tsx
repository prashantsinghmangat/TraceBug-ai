import { type ReactNode } from "react";

// Shared section header: a small mono label, then the title. `align="left"`
// (the homepage) puts the subtitle beside the title on wide screens. Sentence case, weight 500,
// hierarchy from size and colour — not from uppercase tracking or bold.
export default function SectionHeading({
  eyebrow,
  title,
  subtitle,
  align = "center",
  as: Tag = "h2",
  className = "",
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  align?: "center" | "left";
  /** "h1" when the heading opens the page (e.g. /changelog). */
  as?: "h1" | "h2";
  className?: string;
}) {
  if (align === "center") {
    return (
      <div className={`mx-auto flex max-w-2xl flex-col items-center text-center ${className}`}>
        {eyebrow && <Label>{eyebrow}</Label>}
        <Tag className="text-h3 font-medium text-text-primary">
          {title}
        </Tag>
        {subtitle && (
          <p className="mt-4 text-[16px] sm:text-lead text-text-muted">{subtitle}</p>
        )}
      </div>
    );
  }

  return (
    <div className={`grid gap-4 lg:grid-cols-12 lg:gap-12 ${className}`}>
      <div className="lg:col-span-7">
        {eyebrow && <Label>{eyebrow}</Label>}
        <Tag className="max-w-2xl text-h3 font-medium text-text-primary">
          {title}
        </Tag>
      </div>
      {subtitle && (
        <p className="lg:col-span-5 lg:self-end text-[16px] leading-[1.6] text-text-muted">{subtitle}</p>
      )}
    </div>
  );
}

function Label({ children }: { children: ReactNode }) {
  return (
    <span className="mb-4 inline-flex items-center gap-2 font-mono text-[13px] text-text-subtle">
      {children}
    </span>
  );
}
