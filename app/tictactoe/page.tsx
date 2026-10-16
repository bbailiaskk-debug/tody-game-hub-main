import { pageMetadata } from "@/lib/seo";
import PageBody from "./tictactoe-client";

export const metadata = pageMetadata({
  path: "/tictactoe",
  title: "Tic Tac Toe",
  description: "Play Tic Tac Toe (Morra) — classic two-player game.",
});

export default function Page() {
  return <PageBody />;
}
