// "Works with everything" strip — an infinite marquee of supported frameworks.
// Pure CSS marquee (duplicated track translated -50%) so it's zero-JS and smooth.

const FRAMEWORKS = [
  "React", "Next.js", "Vue", "Nuxt", "Angular", "Svelte",
  "SvelteKit", "Remix", "Astro", "Vite", "Solid", "Plain HTML",
];

export default function FrameworkMarquee() {
  return (
    <section className="py-12 border-y border-border bg-surface/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <p className="text-center text-[12.5px] font-medium uppercase tracking-[0.18em] text-text-subtle mb-7">
          Drops into any front-end — 2 lines, zero runtime dependencies
        </p>
        <div className="marquee-mask overflow-hidden">
          <div className="flex w-max animate-marquee-slow gap-4">
            {[...FRAMEWORKS, ...FRAMEWORKS].map((name, i) => (
              <span
                key={i}
                className="flex items-center gap-2 rounded-xl border border-border bg-background px-5 py-2.5 text-[14px] font-medium text-text-muted whitespace-nowrap shadow-xs"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-r from-primary to-accent" />
                {name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
