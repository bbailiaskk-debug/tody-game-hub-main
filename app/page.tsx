import { pageMetadata } from "@/lib/seo";
import PageBody from "./index-client";

export const metadata = pageMetadata({
  path: "/",
  title: "Яки игри и забавление",
  description:
  "Игри, моменти и енергия директно от командния център на Todor Khristov Gaming. Виж какви игри играя и се присъедини към общността.",
  titleSuffix: " — Todor Khristov Gaming",
});

export default function Page() {
  return <PageBody />;
}
