import { pageMetadata } from "@/lib/seo";
import PageBody from "./chess-client";

export const metadata = pageMetadata({
  path: "/chess",
  title: "Шах",
  description: "Play Chess — classic two-player board game, local or online multiplayer.",
});

export default function Page() {
  return <PageBody />;
}
