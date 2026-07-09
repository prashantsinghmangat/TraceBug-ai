// Thin trust strip directly under the hero. Reuses the trust chips that used to
// live inline in the hero, promoted to their own bar so the hero stays focused
// and the proof points read as a scannable row. Matches the framework marquee's
// border-y treatment so it feels native to the page.
//
// The GitHub chip shows the REAL star count (fetched server-side, revalidated
// hourly). We never fabricate a number: if the API is unavailable — or the count
// is still too small to be persuasive — the chip falls back to a plain
// "Star on GitHub" call-to-action instead of showing a weak figure.
import { Check, Star } from "lucide-react";
import { GitHubIcon } from "@/components/ui/brand-icons";

const REPO = "https://github.com/prashantsinghmangat/tracebug-ai";
const REPO_API = "https://api.github.com/repos/prashantsinghmangat/tracebug-ai";
const STAR_DISPLAY_THRESHOLD = 10;

const SIGNALS = ["Open source", "MIT licensed", "Privacy first", "Works offline"];

async function getGitHubStars(): Promise<number | null> {
  try {
    const res = await fetch(REPO_API, {
      headers: { Accept: "application/vnd.github+json" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.stargazers_count === "number" ? data.stargazers_count : null;
  } catch {
    return null;
  }
}

function formatStars(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(n);
}

export default async function TrustBar() {
  const stars = await getGitHubStars();
  const showCount = stars !== null && stars >= STAR_DISPLAY_THRESHOLD;

  return (
    <section className="py-5 border-y border-border bg-surface/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2.5 text-[13px] text-text-muted">
          {SIGNALS.map((t) => (
            <li key={t} className="flex items-center gap-1.5">
              <Check size={13} className="text-success" strokeWidth={3} />
              {t}
            </li>
          ))}
          <li>
            <a
              href={REPO}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-text-muted hover:text-text-primary transition-colors"
            >
              <GitHubIcon size={14} />
              {showCount ? (
                <span className="inline-flex items-center gap-1">
                  <Star size={12} className="text-warning fill-warning" />
                  <span className="font-medium text-text-primary tabular-nums">
                    {formatStars(stars as number)}
                  </span>
                  on GitHub
                </span>
              ) : (
                "Star on GitHub"
              )}
            </a>
          </li>
        </ul>
      </div>
    </section>
  );
}
