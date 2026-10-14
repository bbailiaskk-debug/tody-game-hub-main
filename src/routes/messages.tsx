import { createFileRoute, redirect } from "@tanstack/react-router";
import { MessagesPage } from "../components/messages/MessagesPage";
import { readPersistedAuthSession } from "../lib/local-persistence";
import { seoHead } from "../lib/seo";

export const Route = createFileRoute("/messages")({
  beforeLoad: () => {
    if (typeof window !== "undefined" && !readPersistedAuthSession()) {
      throw redirect({ to: "/login" });
    }
  },
  head: () => {
    const seo = seoHead({
      path: "/messages",
      title: "Съобщения",
      description: "Чатове и съобщения на Todor Khristov Gaming.",
      noindex: true,
    });
    return { meta: seo.meta, links: seo.links };
  },
  component: MessagesPage,
});
