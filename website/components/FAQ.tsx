"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import SectionHeading from "@/components/SectionHeading";
import { FAQ_ITEMS } from "@/components/faq-data";
import Testimonials from "@/components/Testimonials";

// Homepage FAQ accordion. The content lives in faq-data.ts (plain module) so
// app/page.tsx can also build the FAQPage JSON-LD from the same array —
// values can't be imported across the client-component boundary.

export default function FAQ() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="border-t border-border bg-surface/60 py-section">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          align="left"
          eyebrow="Early feedback"
          title="What early testers said"
          subtitle="Real quotes from people who used TraceBug on real bugs before launch."
          className="mb-10"
        />
        <Testimonials />
      </div>
      <div className="mx-auto mt-20 grid max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-12 lg:px-8">
        <div className="lg:col-span-4">
          <SectionHeading
            align="left"
            eyebrow="FAQ"
            title="Questions people ask before installing"
            className="lg:block"
          />
        </div>
        <div className="divide-y divide-border border-y border-border lg:col-span-8">
          {FAQ_ITEMS.map((item, i) => (
            <div key={item.q}>
              <button
                type="button"
                onClick={() => setOpen(open === i ? null : i)}
                aria-expanded={open === i}
                className="group flex w-full items-center justify-between gap-4 py-5 text-left transition-opacity active:opacity-70"
              >
                <span className="text-[16px] font-medium text-text-primary transition-colors group-hover:text-primary">
                  {item.q}
                </span>
                <ChevronDown
                  size={18}
                  strokeWidth={1.5}
                  className={`shrink-0 text-text-subtle transition-[transform,color] duration-200 group-hover:text-text-primary ${
                    open === i ? "rotate-180" : ""
                  }`}
                />
              </button>
              {open === i && (
                <p className="max-w-2xl pb-6 text-[15px] leading-[1.65] text-text-muted">{item.a}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
