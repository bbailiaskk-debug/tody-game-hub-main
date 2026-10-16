import { pageMetadata } from "@/lib/seo";
import PageBody from "./beatbattle-client";

export const metadata = pageMetadata({
  path: "/beatbattle",
  title: "BEAT BATTLE",
  description:
  "Оригинална ритъм игра в дуела на музиката — удряй нотите в ритъма, запълни лентата на съперника и не спирай да свириш.",
});

export default function Page() {
  return <PageBody />;
}
