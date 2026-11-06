// Product Hunt "featured" badge with the live upvote count. The image is
// served by Product Hunt; light and dark versions follow the site theme.
// Used in the hero action row and the footer.
import { LINKS } from "@/lib/site";

const PRODUCT_HUNT_URL =
  "https://www.producthunt.com/products/tracebug?embed=true&utm_source=badge-featured&utm_medium=badge&utm_campaign=badge-tracebug";
const BADGE = `https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=${LINKS.productHuntPostId}`;
const ALT = "TraceBug - Instant bug reports your AI agent can actually debug | Product Hunt";

export default function ProductHuntBadge({
  height = 48,
  className = "",
}: {
  height?: number;
  className?: string;
}) {
  const width = Math.round((height * 250) / 54);
  return (
    <a
      href={PRODUCT_HUNT_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="TraceBug on Product Hunt"
      className={`inline-block transition-opacity duration-150 hover:opacity-90 ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`${BADGE}&theme=light`} alt={ALT} width={width} height={height} loading="lazy" className="dark:hidden" style={{ height, width: "auto" }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`${BADGE}&theme=dark`} alt={ALT} width={width} height={height} loading="lazy" className="hidden dark:block" style={{ height, width: "auto" }} />
    </a>
  );
}
