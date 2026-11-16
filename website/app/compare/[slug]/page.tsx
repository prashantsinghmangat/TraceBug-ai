import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import FinalCTA from "@/components/FinalCTA";
import InstallButtons from "@/components/InstallButtons";
import { notFound } from "next/navigation";
import { social } from "@/lib/social";
import { comparisons } from "@/lib/comparisons";

export async function generateStaticParams() {
  return Object.keys(comparisons).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const data = comparisons[params.slug];
  if (!data) return {};
  return {
    title: data.metaTitle,
    description: data.metaDescription,
    ...social(data.metaTitle, data.metaDescription, { url: `https://tracebug.dev/compare/${params.slug}` }),
    alternates: { canonical: `/compare/${params.slug}` },
  };
}

export default function ComparePage({ params }: { params: { slug: string } }) {
  const data = comparisons[params.slug];
  if (!data) notFound();

  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 pb-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <div className="mb-4 inline-flex items-center gap-2 font-mono text-[13px] text-text-subtle">
              <span className="w-2 h-2 rounded-full bg-accent"></span>
              Comparison
            </div>
            <h1 className="mb-4 text-h2 font-medium text-text-primary">{data.title}</h1>
            <p className="text-xl text-text-muted">{data.tagline}</p>
          </div>

          {/* Quick install CTA: the extension first (what the compared tools are), the SDK as the alternative */}
          <div className="mb-12 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <InstallButtons />
            <span className="font-mono text-[13px] text-text-subtle sm:ml-2">or npm i tracebug-sdk</span>
          </div>

          {/* Advantages */}
          <div className="mb-12">
            <h2 className="text-[26px] font-medium tracking-[-0.02em] text-text-primary mb-6">
              Why developers choose TraceBug over {data.competitor}
            </h2>
            <div className="space-y-4">
              {data.advantages.map((adv, i) => (
                <div key={i} className="flex items-start gap-3 bg-surface border border-border rounded-lg p-4">
                  <span className="text-success text-lg flex-shrink-0 mt-0.5">&#10003;</span>
                  <span className="text-text-primary">{adv}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Honest disadvantages */}
          {data.disadvantages.length > 0 && (
            <div className="mb-12">
              <h2 className="text-[26px] font-medium tracking-[-0.02em] text-text-primary mb-6">
                When {data.competitor} might be a better fit
              </h2>
              <div className="space-y-3">
                {data.disadvantages.map((dis, i) => (
                  <div key={i} className="flex items-start gap-3 text-text-muted">
                    <span className="text-text-muted flex-shrink-0 mt-0.5">&bull;</span>
                    <span>{dis}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Other comparisons: internal links between the pages, and back to the hub */}
          <div className="mb-12">
            <h2 className="text-[20px] font-medium text-text-primary mb-4">Other comparisons</h2>
            <div className="flex flex-wrap gap-2">
              {Object.entries(comparisons)
                .filter(([slug]) => slug !== params.slug)
                .map(([slug, c]) => (
                  <a key={slug} href={`/compare/${slug}`} className="rounded-lg border border-border px-3 py-1.5 text-[14px] text-text-muted hover:border-border-strong hover:text-text-primary">
                    {c.title}
                  </a>
                ))}
              <a href="/compare" className="rounded-lg px-3 py-1.5 text-[14px] font-medium text-text-primary underline underline-offset-2">
                All comparisons
              </a>
            </div>
          </div>

          {/* Final CTA */}
          <div className="bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20 rounded-xl p-8 text-center">
            <h3 className="text-[26px] font-medium tracking-[-0.02em] text-text-primary mb-3">Ready to try TraceBug?</h3>
            <p className="text-text-muted mb-6">Free, open source, and takes under 2 minutes to set up.</p>
            <div className="flex gap-4 justify-center">
              <a href="/docs" className="px-6 py-3 bg-primary text-on-primary rounded-lg font-semibold hover:brightness-110 transition-colors">
                Get Started
              </a>
              <a href="https://github.com/prashantsinghmangat/tracebug-ai" className="px-6 py-3 bg-surface border border-border text-text-primary rounded-lg font-semibold hover:border-primary/50 transition-colors">
                View on GitHub
              </a>
            </div>
          </div>
        </div>
      </div>
      <FinalCTA />
      <Footer />
    </main>
  );
}
