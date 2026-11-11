import { SectionPage } from "@/components/section-page";

export const metadata = { title: "Career" };

export default function CareerPage() {
  return (
    <SectionPage
      eyebrow="career"
      title="the work, the roles, the craft."
      intro="roles, the people you build with, launches, skills and the stack you swear by."
      sections={["career", "tools", "identity"]}
      defaultSection="career"
    />
  );
}
