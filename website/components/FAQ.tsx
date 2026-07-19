"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import SectionHeading from "@/components/SectionHeading";
import { FAQ_ITEMS } from "@/components/faq-data";

// Homepage FAQ accordion. The content lives in faq-data.ts (plain module) so
// app/page.tsx can also build the FAQPage JSON-LD from the same array —
// values can't be imported across the client-component boundary.

export default function FAQ() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="py-20 lg:py-28">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="FAQ"
          title="Questions, answered honestly"
          subtitle="The things people ask before installing — including the catch (there isn't one)."
          className="mb-10"
        />
        <div className="space-y-3">
          {FAQ_ITEMS.map((item, i) => (
            <div
              key={item.q}
              className="overflow-hidden rounded-2xl border border-border bg-background transition-colors hover:border-border-strong"
            >
              <button
                type="button"
                onClick={() => setOpen(open === i ? null : i)}
                aria-expanded={open === i}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
              >
                <span className="text-[15px] font-semibold tracking-[-0.01em] text-text-primary">
                  {item.q}
                </span>
                <ChevronDown
                  size={17}
                  className={`shrink-0 text-text-subtle transition-transform duration-200 ${
                    open === i ? "rotate-180 text-primary" : ""
                  }`}
                />
              </button>
              {open === i && (
                <p className="px-5 pb-5 text-[14px] leading-relaxed text-text-muted">{item.a}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
