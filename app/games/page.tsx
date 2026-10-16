import { pageMetadata } from "@/lib/seo";
import PageBody from "./games-client";

export const metadata = pageMetadata({
  path: "/games",
  title: "Игри",
  description:
  "Играй онлайн безплатно: шах, 2048, Tic Tac Toe, Chrome Dinosaur, въздушен хокей, Wordle, судоку, Candy Crush, DDLC, Crystal Realm, Prism Heart, Stream Heart, Beat Battle и Tetris. Игри на Todor Khristov Gaming — директно в браузъра.",
});

export default function Page() {
  return <PageBody />;
}
