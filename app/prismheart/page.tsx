import { pageMetadata } from "@/lib/seo";
import PageBody from "./prismheart-client";

export const metadata = pageMetadata({
  path: "/prismheart",
  title: "Prism Heart",
  description:
  "A magical girl visual novel. Choose your path, bond with your friends, and decide the fate of the city of Astralis.",
});

export default function Page() {
  return <PageBody />;
}
