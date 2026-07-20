import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { getAllPosts, getPostBySlug } from "@/lib/blog";
import { renderMarkdown } from "@/lib/blog-markdown";

// One dynamic route renders every post from the content layer (lib/blog.ts).
// Statically generated today; when posts move to a backend, either keep SSG
// with revalidation or drop generateStaticParams — the page code is agnostic.

export async function generateStaticParams() {
  const posts = await getAllPosts();
  return posts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const post = await getPostBySlug(params.slug);
  if (!post) return {};
  return {
    title: `${post.title} — TraceBug`,
    description: post.description,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      title: post.title,
      description: post.description,
      type: "article",
      url: `https://tracebug.dev/blog/${post.slug}`,
      ...(post.cover ? { images: [{ url: post.cover, width: 1200, height: 630 }] } : {}),
    },
    ...(post.cover
      ? { twitter: { card: "summary_large_image" as const, title: post.title, description: post.description, images: [post.cover] } }
      : {}),
  };
}

export default async function BlogPostPage({ params }: { params: { slug: string } }) {
  const post = await getPostBySlug(params.slug);
  if (!post) notFound();

  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <article className="pt-32 pb-24">
        <div className="mx-auto max-w-2xl px-4 sm:px-6">
          <div className="mb-3 flex items-center gap-3 text-[11.5px] font-semibold uppercase tracking-wider text-text-subtle">
            <span className="rounded-full border border-primary/30 bg-primary/[0.07] px-2.5 py-0.5 normal-case tracking-normal text-primary">
              {post.tag}
            </span>
            <span>
              {post.date} · {post.readMinutes} min
            </span>
          </div>
          <h1 className="mb-6 text-[34px] font-semibold leading-[1.15] tracking-[-0.03em] text-text-primary">
            {post.title}
          </h1>

          {post.cover && (
            // eslint-disable-next-line @next/next/no-img-element -- author-controlled static hero
            <img
              src={post.cover}
              alt=""
              className="mb-8 w-full rounded-2xl border border-border"
            />
          )}

          {renderMarkdown(post.content)}

          {/* standard closer on every post — keeps post content pure markdown */}
          <div className="mt-10 flex flex-col items-start gap-3 rounded-2xl border border-border bg-surface/50 p-6 sm:flex-row sm:items-center">
            <div className="flex-1">
              <div className="font-semibold text-text-primary">Try the whole loop in two minutes</div>
              <div className="mt-1 text-[13.5px] text-text-muted">
                The live sandbox has real bugs waiting — capture one and hand it to your agent.
              </div>
            </div>
            <Button asChild variant="gradient">
              <a href="/try.html" target="_blank" rel="noopener noreferrer">
                Open the sandbox <ArrowRight size={14} />
              </a>
            </Button>
          </div>
        </div>
      </article>
      <Footer />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: post.title,
            description: post.description,
            datePublished: post.date,
            author: { "@type": "Person", name: "Prashant Singh Mangat" },
            url: `https://tracebug.dev/blog/${post.slug}`,
            ...(post.cover ? { image: `https://tracebug.dev${post.cover}` } : {}),
          }),
        }}
      />
    </main>
  );
}
