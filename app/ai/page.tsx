import { Suspense } from "react";
import { pageMetadata } from "@/lib/seo";
import PageBody from "./ai-client";

export const metadata = pageMetadata({
  /**
  * The bare path, and now it is the URL that answers 200 rather than one that
  * redirects to itself, so the canonical, the language alternates and the
  * sitemap all name a page that is actually there.
  */
  path: "/ai",
  title: "TK-Bot AI",
  description:
  "Попитай TK-Bot, изкуственият интелект асистент на Todor Khristov Gaming. Чат за канала, игрите и музиката.",
});

/**
 * The body reads `?chat=` through `useSearchParams`, which opts the whole
 * subtree out of static rendering until the query string is known. The
 * Suspense boundary is where that bailout resolves, and it is the shell's own
 * loading state rather than a new one invented for the port.
 */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <PageBody />
    </Suspense>
  );
}
