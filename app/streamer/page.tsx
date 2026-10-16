import { pageMetadata } from "@/lib/seo";
import PageBody from "./streamer-client";

export const metadata = pageMetadata({
  path: "/streamer",
  title: "STREAM HEART",
  description:
  "Оригинална симулация на виртуален стриймър с чат, дарения и подаръци — подкрепи Нова и отключи четири финала.",
});

export default function Page() {
  return <PageBody />;
}
