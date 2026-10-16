import { pageMetadata } from "@/lib/seo";
import PageBody from "./profile-client";

export const metadata = pageMetadata({
  path: "/profile",
  title: "Моят профил",
  description: "Редактирай профила си в Todor Khristov Gaming.",
  noindex: true,
});

export default function Page() {
  return <PageBody />;
}
