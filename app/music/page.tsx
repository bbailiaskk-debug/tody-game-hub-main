import { pageMetadata } from "@/lib/seo";
import PageBody from "./music-client";

export const metadata = pageMetadata({
  path: "/music",
  title: "Музика",
  description: "Слушай музиката на Todor Khristov Gaming. Оригинални песни и любими парчета.",
});

export default function Page() {
  return <PageBody />;
}
