import { pageMetadata } from "@/lib/seo";
import PageBody from "./info-client";

export const metadata = pageMetadata({
  path: "/info",
  title: "Зад канала",
  description:
  "Кой е Todor Khristov Gaming: игри за забавление, обработени видеа, график на качване и всички канали за следване.",
});

export default function Page() {
  return <PageBody />;
}
