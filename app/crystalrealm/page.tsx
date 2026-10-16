import { pageMetadata } from "@/lib/seo";
import PageBody from "./crystalrealm-client";

export const metadata = pageMetadata({
  path: "/crystalrealm",
  title: "Crystal Realm",
  description:
  "Оригинална 8-bit action-adventure игра — събирай кристалните шърдове и върни светлината, преди тъмнината да погълне Аталия.",
});

export default function Page() {
  return <PageBody />;
}
