import { Card } from "@/components/ui";
import { SectionPage } from "@/components/section-page";

export const metadata = { title: "Health" };

export default function HealthPage() {
  return (
    <SectionPage
      eyebrow="health"
      title="body, routines, the comeback."
      intro="training, food, sleep, habits. all of it is sensitive, so it stays blurred till you reveal it."
      sections={["health"]}
      defaultSection="health"
      sensitive
      notice={
        <Card className="p-4 text-sm text-muted">
          numbers here are dated snapshots, not live. mom&apos;s health chats from the shared ChatGPT account never land here as yours.
        </Card>
      }
    />
  );
}
