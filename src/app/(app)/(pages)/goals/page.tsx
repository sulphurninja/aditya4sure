import { SectionPage } from "@/components/section-page";

export const metadata = { title: "Goals" };

export default function GoalsPage() {
  return (
    <SectionPage
      eyebrow="goals"
      title="where you're headed."
      intro="targets and plans, planned vs actually done. a goal stays a goal till you tell me it happened."
      sections={["goals", "planning"]}
      defaultSection="goals"
    />
  );
}
