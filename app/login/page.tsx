import { pageMetadata } from "@/lib/seo";
import PageBody from "./login-client";

export const metadata = pageMetadata({
  path: "/login",
  title: "Вход",
  description:
  "Влез в своя акаунт в Todor Khristov Gaming. Достъп до игри, музика и ексклузивно съдържание.",
  noindex: true,
});

export default function Page() {
  return <PageBody />;
}
