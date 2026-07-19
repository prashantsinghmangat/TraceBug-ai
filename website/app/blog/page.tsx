import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Clock } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SectionHeading from "@/components/SectionHeading";
import { getAllPosts } from "@/lib/blog";

export const metadata: Metadata = {
  title: "Blog — TraceBug",
  description:
    "Practical writing on bug reporting, browser debugging, and giving AI coding agents real evidence to work from.",
};

// Pure renderer over the content layer (lib/blog.ts) — knows nothing about
// where posts are stored, so a future backend changes nothing here.
export default async function BlogIndex() {
  const posts = await getAllPosts();

  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <section className="pt-32 pb-24">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <SectionHeading
            align="left"
            eyebrow="Blog"
            title="Notes from building the bug hand-off layer"
            subtitle="Practical writing on bug reporting, browser debugging, and AI-agent workflows. No filler posts."
            className="mb-12"
          />
          <div className="space-y-5">
            {posts.map((post) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="group block rounded-2xl border border-border bg-background p-6 shadow-soft transition-all hover:border-primary/40 hover:shadow-card"
              >
                <div className="mb-2 flex items-center gap-3 text-[11.5px] font-semibold uppercase tracking-wider text-text-subtle">
                  <span className="rounded-full border border-primary/30 bg-primary/[0.07] px-2.5 py-0.5 normal-case tracking-normal text-primary">
                    {post.tag}
                  </span>
                  <span>{post.date}</span>
                  <span className="inline-flex items-center gap-1">
                    <Clock size={11} /> {post.readMinutes} min
                  </span>
                </div>
                <h2 className="text-[19px] font-semibold leading-snug tracking-[-0.02em] text-text-primary">
                  {post.title}
                </h2>
                <p className="mt-2 text-[14px] leading-relaxed text-text-muted">{post.description}</p>
                <span className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary">
                  Read <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
