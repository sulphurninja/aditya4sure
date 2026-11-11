import { MemoryList } from "@/components/memory/memory-list";
import { NewMemoryButton } from "@/components/memory/new-memory";
import { SensitiveToggle } from "@/components/memory/sensitive";
import { Timeline } from "@/components/timeline";
import { PageHeader } from "@/components/ui";
import type { Section } from "@/lib/domain";
import { memoriesWhere } from "@/lib/server/queries";

export async function SectionPage({
  eyebrow,
  title,
  intro,
  sections,
  defaultSection,
  notice,
  sensitive = false,
}: {
  eyebrow: string;
  title: string;
  intro: React.ReactNode;
  sections: Section[];
  defaultSection: Section;
  notice?: React.ReactNode;
  sensitive?: boolean;
}) {
  const memories = await memoriesWhere({ section: { $in: sections } }).catch(() => []);
  const dated = memories.filter((m) => m.eventAt);
  return (
    <>
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        actions={
          <>
            {(sensitive || memories.some((m) => m.sensitivity === "sensitive")) && <SensitiveToggle />}
            <NewMemoryButton defaultSection={defaultSection} />
          </>
        }
      >
        {intro}
      </PageHeader>
      {notice && <div className="mb-6">{notice}</div>}
      <div className={dated.length > 2 ? "grid gap-8 lg:grid-cols-[1.1fr_1fr]" : ""}>
        <section>
          <MemoryList memories={memories} showSection={sections.length > 1} emptyHint="add one by hand, or just tell me in chat and hit Learn." />
        </section>
        {dated.length > 2 && (
          <section>
            <h2 className="mb-4 text-sm font-medium">over time</h2>
            <Timeline memories={dated} today={new Date().toISOString().slice(0, 10)} />
          </section>
        )}
      </div>
    </>
  );
}
