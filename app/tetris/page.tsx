import { pageMetadata } from "@/lib/seo";
import PageBody from "./tetris-client";

export const metadata = pageMetadata({
  path: "/tetris",
  title: "TETRIS",
  description:
  "Класически TETRIS в стила на урока за C# — редиш падащите блокове, чистиш редове и записваш рекорд.",
});

export default function Page() {
  return <PageBody />;
}
