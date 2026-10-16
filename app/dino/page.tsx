import { pageMetadata } from "@/lib/seo";
import PageBody from "./dino-client";

export const metadata = pageMetadata({
  path: "/dino",
  title: "Chrome Dinosaur Game",
  description: "Playable Chrome Dinosaur Game — jump over the cacti and take a break.",
});

export default function Page() {
  return <PageBody />;
}
