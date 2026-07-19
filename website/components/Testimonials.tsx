import { Star } from "lucide-react";
import SectionHeading from "@/components/SectionHeading";

// Real quotes from the first testers (friends & colleagues who tried TraceBug
// on real bugs). Honesty rules for this section: only quotes actually said to
// us, attributed as "Early TraceBug user" until people opt in to names/roles,
// and no photoreal faces — avatars are obviously-illustrated artwork (or
// monogram circles), never fake photographs. Rendered as the same pure-CSS
// marquee as FrameworkMarquee (duplicated track, translate -50%) so the
// section stays one compact row; pauses on hover for reading.
const TESTIMONIALS: { quote: string; who: string; stars: 4 | 5; hue: string; avatar?: string }[] = [
  {
    quote:
      "I was able to capture a bug in seconds and immediately share everything needed to understand what happened.",
    who: "Ankit Rana",
    stars: 5,
    hue: "from-[#818CF8] to-[#4F46E5]",
    avatar: "/avatars/avatar-1.png",
  },
  {
    quote:
      "TraceBug helped me report a bug instantly. I didn't have to explain every step manually — the report already captured the important details.",
    who: "Rohit Singh",
    stars: 5,
    hue: "from-[#6366F1] to-[#312E81]",
    avatar: "/avatars/avatar-2.png",
  },
  {
    quote:
      "Finally, a bug reporting tool that doesn't make you fill out a huge form. Just capture what happened and share the report.",
    who: "Khushi Kumari",
    stars: 4,
    hue: "from-[#A5B4FC] to-[#6366F1]",
    avatar: "/avatars/avatar-3.png",
  },
  {
    quote:
      "Instead of saying 'something went wrong,' I can send a report with the actual evidence.",
    who: "Steve",
    stars: 5,
    hue: "from-[#4F46E5] to-[#1E1B4B]",
    avatar: "/avatars/avatar-4.png",
  },
  {
    quote:
      "Simple, fast, and free. I can see myself using this whenever I run into a bug that needs to be reported quickly.",
    who: "Shivani",
    stars: 4,
    hue: "from-[#818CF8] to-[#6366F1]",
    avatar: "/avatars/avatar-5.png",
  },
  {
    quote:
      "It gives you much more useful information than just sending a screenshot.",
    who: "Kristine",
    stars: 5,
    hue: "from-[#6366F1] to-[#4338CA]",
  },
  {
    quote:
      "I tried it on a real bug and the whole process was very smooth — much easier than putting together a bug report manually.",
    who: "Early TraceBug user",
    stars: 5,
    hue: "from-[#A5B4FC] to-[#4F46E5]",
  },
  {
    quote:
      "The report had the details I needed to explain the bug clearly. It saved me a lot of time.",
    who: "Early TraceBug user",
    stars: 4,
    hue: "from-[#818CF8] to-[#312E81]",
  },
];

function Stars({ n }: { n: number }) {
  return (
    <span className="flex gap-0.5" aria-label={`${n} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          size={12}
          className={i < n ? "fill-amber-400 text-amber-400" : "fill-border text-border"}
        />
      ))}
    </span>
  );
}

export default function Testimonials() {
  return (
    <section className="py-14 border-y border-border bg-surface/50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Early feedback"
          title="What the first testers said"
          subtitle="Real quotes from real bugs, captured before launch. No stock photos, no invented names."
          className="mb-9"
        />
      </div>
      {/* full-bleed marquee; hover pauses so quotes are readable */}
      <div className="marquee-mask group overflow-hidden">
        <div className="flex w-max animate-marquee gap-4 group-hover:[animation-play-state:paused]">
          {[...TESTIMONIALS, ...TESTIMONIALS].map((t, i) => (
            <figure
              key={i}
              className="flex w-[330px] shrink-0 flex-col gap-3 rounded-2xl border border-border bg-background p-5 shadow-xs"
            >
              <Stars n={t.stars} />
              <blockquote className="flex-1 text-[13px] leading-relaxed text-text-primary">
                &ldquo;{t.quote}&rdquo;
              </blockquote>
              <figcaption className="flex items-center gap-2.5">
                {t.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 96px static asset, next/image is overhead here
                  <img
                    src={t.avatar}
                    alt=""
                    width={28}
                    height={28}
                    loading="lazy"
                    className="h-7 w-7 rounded-full object-cover"
                  />
                ) : (
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br ${t.hue} text-[10px] font-bold text-white`}
                    aria-hidden="true"
                  >
                    {String.fromCharCode(65 + (i % TESTIMONIALS.length))}
                  </span>
                )}
                <span className="text-[12px] font-medium text-text-muted">{t.who}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
