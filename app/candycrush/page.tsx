import { pageMetadata } from "@/lib/seo";
import PageBody from "./candycrush-client";

export const metadata = pageMetadata({
  path: "/candycrush",
  title: "Candy Crush",
  description:
  "Play Candy Crush with Minecraft ores — swap coal, iron, gold, diamond and emerald gems to match three or more.",
});

export default function Page() {
  return <PageBody />;
}
