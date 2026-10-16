import { pageMetadata } from "@/lib/seo";
import PageBody from "./rules-client";

export const metadata = pageMetadata({
  path: "/rules",
  title: "Правила на сайта",
  description:
  "Правилата на Todor Khristov Gaming: добър тон, без спам, спазване на реда и защита на личните данни, за да е приятно на всички.",
});

export default function Page() {
  return <PageBody />;
}
