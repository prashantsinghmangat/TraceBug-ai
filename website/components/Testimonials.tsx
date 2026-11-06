
// Real quotes from the first testers (friends & colleagues who tried TraceBug
// on real bugs). Honesty rules for this section: only quotes actually said to
// us, real names only, and no photoreal faces — avatars are obviously-
// illustrated artwork (or monogram circles), never fake photographs.
// Deliberately small: four confirmed quotes in a static grid beats a scrolling
// wall of praise on a young product — /proof carries the persuasion load.
// Each named person below has agreed to their name and quote appearing publicly.
const TESTIMONIALS: { quote: string; who: string; hue: string; avatar?: string }[] = [
  {
    quote:
      "TraceBug helped me report a bug instantly. I didn't have to explain every step manually — the report already captured the important details.",
    who: "Rohit Singh",
    hue: "from-[#6366F1] to-[#312E81]",
    avatar: "/avatars/avatar-2.png",
  },
  {
    quote:
      "Finally, a bug reporting tool that doesn't make you fill out a huge form. Just capture what happened and share the report.",
    who: "Khushi Kumari",
    hue: "from-[#A5B4FC] to-[#6366F1]",
    avatar: "/avatars/avatar-3.png",
  },
  {
    quote:
      "Instead of saying 'something went wrong,' I can send a report with the actual evidence.",
    who: "Steve",
    hue: "from-[#4F46E5] to-[#1E1B4B]",
    avatar: "/avatars/avatar-4.png",
  },
  {
    quote:
      "It gives you much more useful information than just sending a screenshot.",
    who: "Kristine",
    hue: "from-[#6366F1] to-[#4338CA]",
  },
];

// Rendered inside the FAQ section ("Developer feedback + FAQ"), so it is a
// bare grid with no section wrapper of its own.
export default function Testimonials() {
  return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TESTIMONIALS.map((t) => (
            <figure
              key={t.who}
              className="flex flex-col gap-6 rounded-2xl border border-border bg-background p-6"
            >
              <blockquote className="flex-1 text-[15px] leading-[1.6] text-text-primary">
                &ldquo;{t.quote}&rdquo;
              </blockquote>
              <figcaption className="flex items-center gap-2.5">
                {t.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 96px static asset, next/image is overhead here
                  <img
                    src={t.avatar}
                    alt=""
                    width={32}
                    height={32}
                    loading="lazy"
                    className="h-8 w-8 rounded-full object-cover"
                  />
                ) : (
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-[13px] font-medium text-text-muted"
                    aria-hidden="true"
                  >
                    {t.who.charAt(0)}
                  </span>
                )}
                <span className="text-[14px] text-text-muted">{t.who}</span>
              </figcaption>
            </figure>
          ))}
        </div>
  );
}
