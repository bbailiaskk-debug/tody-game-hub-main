import { pageMetadata } from "@/lib/seo";
import PageBody from "./messages-client";

export const metadata = pageMetadata({
  path: "/messages",
  title: "Съобщения",
  description: "Чатове и съобщения на Todor Khristov Gaming.",
  noindex: true,
});

export default function Page() {
  return <PageBody />;
}
