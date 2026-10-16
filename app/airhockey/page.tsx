import { pageMetadata } from "@/lib/seo";
import PageBody from "./airhockey-client";

export const metadata = pageMetadata({
  path: "/airhockey",
  title: "Air Hockey",
  description:
  "Въздушен хокей за двама играчи на едно устройство, срещу компютъра или онлайн 1-на-1 с приятел — първият до 7 гола печели. Играй безплатно в браузъра.",
});

export default function Page() {
  return <PageBody />;
}
