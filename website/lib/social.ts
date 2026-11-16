import type { Metadata } from "next";

// Share-card metadata for one page. Next merges metadata shallowly: a page
// that sets `openGraph` without `images` gets no og:image, and a page that
// doesn't set `twitter` unfurls with the HOME page's title and description
// (layout.tsx). This sets both from the same values so a shared /compare or
// /docs link previews as itself.
export function social(
  title: string,
  description: string,
  opts: { url?: string; image?: string; imageAlt?: string } = {},
): Pick<Metadata, "openGraph" | "twitter"> {
  const image = opts.image ?? "/api/og";
  return {
    openGraph: {
      title,
      description,
      type: "website",
      siteName: "TraceBug",
      ...(opts.url ? { url: opts.url } : {}),
      images: [{ url: image, width: 1200, height: 630, ...(opts.imageAlt ? { alt: opts.imageAlt } : {}) }],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}
