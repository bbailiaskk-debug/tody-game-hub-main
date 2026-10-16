import { pageMetadata } from "@/lib/seo";
import PageBody from "./wordle-client";

export const metadata = pageMetadata({
  path: "/wordle",
  title: "Wordle",
  description: "Play Wordle — guess the hidden 5-letter word in six tries.",
});

export default function Page() {
  return <PageBody />;
}
