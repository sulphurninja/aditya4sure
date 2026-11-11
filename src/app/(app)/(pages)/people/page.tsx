import { PawPrint, Users } from "lucide-react";
import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { DatesCard } from "@/components/people-extras";
import { allDates, driftingPeople } from "@/lib/server/people";
import { entitiesByKind } from "@/lib/server/queries";
import { formatWhen } from "@/lib/utils";

export const metadata = { title: "People" };

export default async function PeoplePage() {
  const [all, dates, drifting] = await Promise.all([entitiesByKind(["person", "pet"]).catch(() => []), allDates().catch(() => []), driftingPeople(21).catch(() => [])]);
  const people = all.filter((p) => p._id !== "person:aditya").sort((a, b) => b.memoryCount - a.memoryCount);
  return (
    <>
      <PageHeader eyebrow="people" title="the people in your life.">
        only what was actually said or done. no guessing what anyone&apos;s thinking, that&apos;s not my job.
      </PageHeader>
      <div className="mb-8 grid gap-4 md:grid-cols-2">
        <DatesCard initial={dates.slice(0, 10).map((d) => ({ _id: d._id, personName: d.personName, kind: d.kind, label: d.label, monthDay: d.monthDay, next: d.next, inDays: d.inDays, confidence: d.confidence, source: d.source }))} />
        <Card className="p-5">
          <p className="mb-3 font-mono text-[11px] text-faint">{"// drifting (nothing in 3+ weeks)"}</p>
          {drifting.length === 0 ? (
            <p className="text-sm text-faint">you&apos;re in touch with everyone I know about.</p>
          ) : (
            <ul className="space-y-2">
              {drifting.slice(0, 8).map((d) => (
                <li key={d.id} className="flex items-center gap-2 text-sm">
                  <Link href={`/people/${d.slug}`} className="flex-1 truncate text-fg hover:text-accent">
                    {d.name}
                    {d.relationship ? <span className="text-faint"> · {d.relationship}</span> : null}
                  </Link>
                  <span className="font-mono text-[11px] text-faint">{d.days === null ? "never" : `${d.days}d`}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      {people.length === 0 ? (
        <EmptyState icon={<Users />} title="nobody here yet">import your seed from Sources and they&apos;ll show up.</EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {people.map((p, i) => (
            <Link key={p._id} href={`/people/${p.slug}`} className="animate-rise" style={{ animationDelay: `${i * 30}ms` }}>
              <Card className="group h-full p-5 transition hover:border-line-strong">
                <div className="flex items-start justify-between gap-2">
                  <span className="grid size-11 place-items-center rounded-full border border-line-strong bg-grad font-display text-xl font-bold text-accent-ink">
                    {p.kind === "pet" ? <PawPrint className="size-4" /> : p.name[0]}
                  </span>
                  <div className="flex gap-1">
                    {p.identityBoundary && <Badge tone="warn">boundary</Badge>}
                    {p.sensitivity === "sensitive" && <Badge tone="sensitive">sensitive</Badge>}
                  </div>
                </div>
                <h2 className="mt-4 text-[17px] font-medium text-fg">{p.name}</h2>
                <p className="text-sm capitalize text-muted">{p.relationship}</p>
                <p className="mt-4 font-mono text-[11px] text-faint">
                  {p.memoryCount} memories{p.latest ? ` · latest ${formatWhen(p.latest)}` : ""}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
