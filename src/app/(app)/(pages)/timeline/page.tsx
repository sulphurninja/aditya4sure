import { SensitiveToggle } from "@/components/memory/sensitive";
import { Timeline } from "@/components/timeline";
import { PageHeader } from "@/components/ui";
import { timeline } from "@/lib/server/queries";

export const metadata = { title: "Life Timeline" };

export default async function TimelinePage() {
  const memories = await timeline().catch(() => []);
  return (
    <>
      <PageHeader eyebrow="timeline" title="your life, in order." actions={<SensitiveToggle />}>
        events, launches, plans and snapshots by date. future stuff is marked planned, not done.
      </PageHeader>
      <div className="max-w-3xl">
        <Timeline memories={memories} filterable today={new Date().toISOString().slice(0, 10)} />
      </div>
    </>
  );
}
