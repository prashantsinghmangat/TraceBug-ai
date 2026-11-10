import { LINKS } from "@/lib/site";
import Link from "next/link";
import { GitHubIcon, NpmIcon } from "@/components/ui/brand-icons";
import { LogoMark } from "@/components/Logo";
import ProductHuntBadge from "@/components/ProductHuntBadge";
import { YOUTUBE_CHANNEL_URL } from "@/lib/links";


const COLUMNS: { title: string; links: { label: string; href: string; external?: boolean }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "/features" },
      { label: "AI bug fix", href: "/ai-bug-fix" },
      { label: "Instant bug report", href: "/instant-bug-report" },
      { label: "Claude Code bug reports", href: "/claude-code-bug-reports" },
      { label: "Cursor bug reports", href: "/cursor-bug-reports" },
      { label: "Demo", href: "/#demo" },
      { label: "Pricing", href: "/pricing" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Documentation", href: "/docs" },
      { label: "Blog", href: "/blog" },
      { label: "Changelog", href: "/changelog" },
      { label: "MCP Server", href: "/docs/mcp" },
      { label: "Playwright Reporter", href: "/docs/playwright" },
      { label: "AI Debugger", href: "/docs/ai-debugger" },
      { label: "HAR Export", href: "/docs/har-export" },
      { label: "GitHub", href: LINKS.repo, external: true },
      { label: "npm package", href: LINKS.npm, external: true },
      { label: "Browser extension", href: "/#install" },
      { label: "Sentry alternative", href: "/compare/sentry-alternative" },
      { label: "Jam alternative", href: "/compare/jam-alternative" },
    ],
  },
  {
    title: "Community",
    links: [
      { label: "Send feedback", href: "/feedback" },
      { label: "Review us on Product Hunt", href: "https://www.producthunt.com/products/tracebug/reviews", external: true },
      { label: "YouTube", href: YOUTUBE_CHANNEL_URL, external: true },
      { label: "Issues", href: `${LINKS.repo}/issues`, external: true },
      { label: "Report a bug", href: `${LINKS.repo}/issues/new`, external: true },
      { label: "Contribute", href: `${LINKS.repo}/blob/main/CONTRIBUTING.md`, external: true },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", href: "/privacy" },
      { label: "MIT License", href: `${LINKS.repo}/blob/main/LICENSE`, external: true },
      { label: "Open source", href: LINKS.repo, external: true },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-10">
          {/* Brand */}
          <div className="col-span-2">
            <Link href="/" className="flex items-center gap-2 mb-4">
              <LogoMark size={28} />
              <span className="font-medium text-[16px] text-text-primary">TraceBug</span>
            </Link>
            <p className="text-[14px] text-text-muted leading-[1.6] max-w-xs">
              Bug reports a developer or an AI agent can open and fix. Local-first, zero backend, free
              and open source.
            </p>
            <div className="flex items-center gap-2 mt-5">
              <a href={LINKS.repo} target="_blank" rel="noopener noreferrer" aria-label="GitHub"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-text-muted hover:text-text-primary hover:bg-surface transition-colors">
                <GitHubIcon size={16} />
              </a>
              <a href={LINKS.npm} target="_blank" rel="noopener noreferrer" aria-label="npm"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-text-muted hover:text-text-primary hover:bg-surface transition-colors">
                <NpmIcon size={16} />
              </a>
            </div>
            <ProductHuntBadge height={44} className="mt-5" />
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h3 className="text-[14px] font-medium text-text-primary mb-4">{col.title}</h3>
              <ul className="space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    {link.external ? (
                      <a href={link.href} target="_blank" rel="noopener noreferrer"
                        className="text-[14px] text-text-muted hover:text-text-primary transition-colors">
                        {link.label}
                      </a>
                    ) : (
                      <Link href={link.href} className="text-[14px] text-text-muted hover:text-text-primary transition-colors">
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 pt-7 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-[13px] text-text-subtle">© 2026 TraceBug. Open source under the MIT License</p>
          <p className="text-[13px] text-text-subtle">
            Made for developers tired of “cannot reproduce”
          </p>
        </div>
      </div>
    </footer>
  );
}
