import { pageMetadata } from "@/lib/seo";
import PageBody from "./prompt-lab-client";

export const metadata = pageMetadata({
  path: "/prompt-lab",
  title: "AI Prompt Lab",
  description: "Избери модел и подобри prompt-а си в локалния AI Prompt Lab.",
  noindex: true,
});

export default function Page() {
  return <PageBody />;
}
