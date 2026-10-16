import { pageMetadata } from "@/lib/seo";
import PageBody from "./ddlc-client";

export const metadata = pageMetadata({
  path: "/ddlc",
  title: "DDLC Poetry Club",
  description:
  "Write poems in the Literature Club. Pick the words that match each club member — Sayori, Natsuki, Yuri and Monika.",
});

export default function Page() {
  return <PageBody />;
}
