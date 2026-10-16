import { Suspense } from "react";
import { pageMetadata } from "@/lib/seo";
import PageBody from "./reset-password-client";

export const metadata = pageMetadata({
  path: "/reset-password",
  title: "Смяна на парола",
  description: "Смяна на парола за акаунта ти в Todor Khristov Gaming.",
  noindex: true,
});

/**
 * The reset link carries `?email=` and `?token=`, read through
 * `useSearchParams` — so the page is client-rendered behind this boundary.
 */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <PageBody />
    </Suspense>
  );
}
