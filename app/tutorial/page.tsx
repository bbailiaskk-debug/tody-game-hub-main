import { pageMetadata } from "@/lib/seo";
import PageBody from "./tutorial-client";

export const metadata = pageMetadata({
  path: "/tutorial",
  title: "Туториал: къде са правилата?",
  description:
  "Кратко ръководство как се стига до правилата на сайта: отвори менюто горе вдясно и избери ПРАВИЛА.",
});

export default function Page() {
  return <PageBody />;
}
