import { type ReactNode } from "react";

// Shared section header — keeps every section's eyebrow/title/subtitle rhythm
// identical, which is most of what makes a long page feel designed (not stacked).
export default function SectionHeading({
  eyebrow,
  title,
  subtitle,
  align = "center",
  className = "",
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  align?: "center" | "left";
  className?: string;
}) {
  const alignCls = align === "center" ? "text-center mx-auto items-center" : "text-left items-start";
  return (
    <div className={`flex flex-col ${alignCls} ${className}`}>
      {eyebrow && (
        <span className="inline-flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-primary mb-4">
          {eyebrow}
        </span>
      )}
      <h2 className="max-w-3xl text-[30px] sm:text-4xl lg:text-[44px] font-semibold tracking-[-0.03em] leading-[1.1] text-text-primary">
        {title}
      </h2>
      {subtitle && (
        <p className={`mt-4 max-w-2xl text-text-muted text-base sm:text-lg leading-relaxed ${align === "center" ? "" : ""}`}>
          {subtitle}
        </p>
      )}
    </div>
  );
}
