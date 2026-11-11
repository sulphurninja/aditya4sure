import { FolderKanban } from "lucide-react";
import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { entitiesByKind } from "@/lib/server/queries";
import { formatWhen } from "@/lib/utils";

export const metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const projects = (await entitiesByKind(["project", "organization"]).catch(() => [])).sort((a, b) => b.memoryCount - a.memoryCount);
  return (
    <>
      <PageHeader eyebrow="projects" title="stuff you're building.">
        every metric comes with its date. a Feb number is a Feb number, not today&apos;s.
      </PageHeader>
      {projects.length === 0 ? (
        <EmptyState icon={<FolderKanban />} title="No projects yet">Import your seed to populate projects.</EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((p, i) => (
            <Link key={p._id} href={`/projects/${p.slug}`} className="animate-rise" style={{ animationDelay: `${i * 35}ms` }}>
              <Card className="group relative h-full overflow-hidden p-6 transition hover:border-line-strong">
                <div className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-accent/10 blur-2xl transition group-hover:bg-accent/20" />
                <div className="flex items-center justify-between">
                  <Badge tone={p.kind === "organization" ? "info" : "accent"}>{p.relationship}</Badge>
                  <span className="font-mono text-[11px] text-faint">{p.memoryCount} memories</span>
                </div>
                <h2 className="mt-5 font-display text-3xl font-bold tracking-[-0.03em]">{p.name}</h2>
                {p.description && <p className="mt-2 text-sm leading-relaxed text-muted">{p.description}</p>}
                <p className="mt-5 font-mono text-[11px] text-faint">{p.latest ? `last update ${formatWhen(p.latest)}` : "no dated updates"}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
