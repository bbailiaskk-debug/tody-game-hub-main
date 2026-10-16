import { pageMetadata } from "@/lib/seo";
import PageBody from "./game2048-client";

export const metadata = pageMetadata({
  path: "/game2048",
  title: "2048",
  description: "Play 2048 — slide and merge tiles to reach 2048.",
});

export default function Page() {
  return <PageBody />;
}
