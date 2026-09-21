export const SITE_URL = "https://tody-game-hub.bbailiaskk.workers.dev";
const OG_IMAGE_SRC = "/images/og-image.jpg";

type HeadMeta = {
  title?: string;
  name?: string;
  property?: string;
  content?: string;
};

type HeadLink = {
  rel: string;
  href?: string;
  hrefLang?: string;
  type?: string;
  sizes?: string;
};

/**
 * Builds the canonical + Open Graph + Twitter + hreflang head block for a page.
 *
 * Every public page gets exactly ONE canonical pointing at the clean URL, the
 * shared OG/Twitter image, and a consistent hreflang set (bg / en / zh /
 * x-default). Private pages can set `noindex` to keep search engines out while
 * still declaring their own canonical (no inherited duplicates).
 */
export function seoHead(opts: {
  path: string;
  title: string;
  description: string;
  noindex?: boolean;
  titleSuffix?: string;
}): { meta: HeadMeta[]; links: HeadLink[] } {
  const url = `${SITE_URL}${opts.path}`;
  const image = `${SITE_URL}${OG_IMAGE_SRC}`;
  const suffix = opts.titleSuffix ?? " — Todor Khristov Gaming";
  const fullTitle = `${opts.title}${suffix}`;

  const meta: HeadMeta[] = [
    { title: fullTitle },
    { name: "description", content: opts.description },
    { property: "og:title", content: fullTitle },
    { property: "og:description", content: opts.description },
    { property: "og:url", content: url },
    { property: "og:image", content: image },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { property: "og:image:type", content: "image/jpeg" },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: fullTitle },
    { name: "twitter:description", content: opts.description },
    { name: "twitter:image", content: image },
  ];
  if (opts.noindex) {
    meta.push({ name: "robots", content: "noindex, nofollow" });
  }

  const links: HeadLink[] = [
    { rel: "canonical", href: url },
    { rel: "alternate", hrefLang: "bg", href: url },
    { rel: "alternate", hrefLang: "en", href: `${url}?lang=en` },
    { rel: "alternate", hrefLang: "zh", href: `${url}?lang=zh` },
    { rel: "alternate", hrefLang: "x-default", href: url },
  ];

  return { meta, links };
}
