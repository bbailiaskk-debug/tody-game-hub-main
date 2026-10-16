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
  type?: string;
  sizes?: string;
};

/**
 * Builds the canonical + Open Graph + Twitter head block for a page.
 *
 * Every public page gets exactly ONE canonical pointing at the clean URL, the
 * shared OG/Twitter image, and a consistent title and description.
 *
 * There are deliberately no `alternate hreflang` links, and there were some once.
 * They pointed at `?lang=en` and `?lang=zh`, on the reasoning that the site has a
 * language switcher. But the switcher is a client preference — it lives in
 * localStorage — so the server answers every one of those URLs with the same
 * Bulgarian document: `/games?lang=en` is byte-for-byte `/games`, down to
 * `<html lang="bg">`. Declaring a page as the English version of itself when it is
 * not is worse than saying nothing: the audit reports it, and a crawler that
 * believes it discards the annotation and the canonical with it.
 *
 * So the honest head for this site is one language and one URL. Should the
 * language ever become part of the URL, the alternates come back with the change
 * that makes them true — a server that reads the parameter and renders it — not
 * before.
 *
 * Private pages can set `noindex` to keep search engines out while still
 * declaring their own canonical (no inherited duplicates).
 *
 * `path` must be a URL that answers 200 as written, query string and all. A
 * canonical or a sitemap entry that points at a redirect is a page the audit
 * reports and a crawler follows one hop for nothing.
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

  const links: HeadLink[] = [{ rel: "canonical", href: url }];

  return { meta, links };
}

/**
 * Next.js port of `seoHead`.
 *
 * The Vite build fed `seoHead`'s arrays straight into TanStack Router's `head()`
 * option. Next.js App Router takes a single `Metadata` object instead, so the
 * same input now produces the equivalent — identical title, description, OG and
 * Twitter tags, the same canonical, and the same `noindex` behaviour.
 *
 * Kept next to `seoHead` rather than beside the routes so the two stay visibly
 * the same contract: one says "these are the tags", the other says "this is
 * where Next wants them".
 */
export function pageMetadata(opts: {
  path: string;
  title: string;
  description: string;
  noindex?: boolean;
  titleSuffix?: string;
}): {
  title: string;
  description: string;
  alternates: { canonical: string };
  robots?: { index: boolean; follow: boolean };
  openGraph: Record<string, string>;
  twitter: Record<string, string>;
} {
  const { meta, links } = seoHead(opts);
  const url = `${SITE_URL}${opts.path}`;
  const image = `${SITE_URL}${OG_IMAGE_SRC}`;
  const canonical = links.find((link) => link.rel === "canonical")?.href ?? url;
  const fullTitle = meta.find((entry) => entry.title)?.title ?? opts.title;

  const pick = (key: string) =>
    meta
      .filter((entry) => entry.property === key)
      .map((entry) => entry.content ?? "")
      .filter(Boolean);

  const pickName = (key: string) =>
    meta
      .filter((entry) => entry.name === key)
      .map((entry) => entry.content ?? "")
      .filter(Boolean);

  return {
    title: fullTitle,
    description: opts.description,
    alternates: { canonical },
    ...(opts.noindex ? { robots: { index: false, follow: false } } : {}),
    openGraph: {
      title: pick("og:title")[0] ?? fullTitle,
      description: pick("og:description")[0] ?? opts.description,
      url,
      image,
      width: pick("og:image:width")[0] ?? "1200",
      height: pick("og:image:height")[0] ?? "630",
      type: pick("og:type")[0] ?? "website",
      siteName: "Todor Khristov Gaming",
      locale: "bg_BG",
    },
    twitter: {
      card: pickName("twitter:card")[0] ?? "summary_large_image",
      title: pickName("twitter:title")[0] ?? fullTitle,
      description: pickName("twitter:description")[0] ?? opts.description,
      image: pickName("twitter:image")[0] ?? image,
    },
  };
}
