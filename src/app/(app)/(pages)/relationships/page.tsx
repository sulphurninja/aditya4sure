import { BookHeart } from "lucide-react";
import Link from "next/link";
import { SensitiveToggle } from "@/components/memory/sensitive";
import { Timeline } from "@/components/timeline";
import { MemoryList } from "@/components/memory/memory-list";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { entitiesByKind, memoriesWhere } from "@/lib/server/queries";

export const metadata = { title: "Relationships" };

export default async function RelationshipsPage() {
  const [people, memories] = await Promise.all([
    entitiesByKind(["person", "pet"]).catch(() => []),
    memoriesWhere({ section: { $in: ["relationships", "family", "pets"] } }).catch(() => []),
  ]);
  const close = people.filter((p) => ["partner", "sister", "mother", "cat", "kitten"].includes(p.relationship ?? ""));
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <PageHeader eyebrow="relationships" title="the ones closest to you." actions={<SensitiveToggle />}>
        moments, plans, gifts, promises. with the actual words, not some vibe analysis. sensitive stuff stays blurred till you say so.
      </PageHeader>
      {memories.length === 0 ? (
        <EmptyState icon={<BookHeart />} title="Nothing here yet">Import your seed to see relationship memories.</EmptyState>
      ) : (
        <div className="space-y-10">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {close.map((p) => (
              <Link key={p._id} href={`/people/${p.slug}`}>
                <Card className="p-4 transition hover:border-line-strong">
                  <p className="text-[15px] font-medium">{p.name}</p>
                  <p className="text-xs capitalize text-muted">{p.relationship}</p>
                  <div className="mt-3 flex items-center gap-2">
                    <span className="font-mono text-[11px] text-faint">{p.memoryCount} memories</span>
                    {p.identityBoundary && <Badge tone="warn">boundary</Badge>}
                  </div>
                </Card>
              </Link>
            ))}
          </div>
          <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr]">
            <section>
              <h2 className="mb-4 text-sm font-medium">moments & plans</h2>
              <Timeline memories={memories} order="desc" today={today} />
            </section>
            <section>
              <h2 className="mb-4 text-sm font-medium">everything here</h2>
              <MemoryList memories={memories} />
            </section>
          </div>
        </div>
      )}
    </>
  );
}
