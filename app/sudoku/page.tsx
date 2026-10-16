import { pageMetadata } from "@/lib/seo";
import PageBody from "./sudoku-client";

export const metadata = pageMetadata({
  path: "/sudoku",
  title: "Судоку",
  description: "Play Sudoku — the classic 9×9 number puzzle with three difficulty levels.",
});

export default function Page() {
  return <PageBody />;
}
