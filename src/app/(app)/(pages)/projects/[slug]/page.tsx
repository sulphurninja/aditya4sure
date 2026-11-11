import { History, Radar } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EntityDetail } from "@/components/entity-detail";
import { Card } from "@/components/ui";
import { entityDetail } from "@/lib/server/queries";
import { formatWhen } from "@/lib/utils";

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await entityDetail(["project", "organization"], slug);
  if (!data) notFound();
  const snapshots = data.memories.filter((m) => m.temporal === "snapshot").sort((a, b) => (b.eventAt ?? "").localeCompare(a.eventAt ?? ""));
  const forward = data.memories.filter((m) => m.temporal === "goal" || m.temporal === "plan" || m.type === "project_fact").slice(0, 6);
  return (
    <EntityDetail
      entity={data.entity}
      memories={data.memories}
      links={data.links}
      back={{ href: "/projects", label: "Projects" }}
      askPrompt={`Give me a sharp status brief on ${data.entity.name}: what's current, what's historical, and what's unknown.`}
    >
      {(snapshots.length > 0 || forward.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-medium">
              <History className="size-4 text-info" /> Historical snapshots
            </h2>
            {snapshots.length === 0 ? (
              <p className="text-sm text-faint">No dated metrics.</p>
            ) : (
              <ul className="space-y-3">
                {snapshots.map((m) => (
                  <li key={m._id}>
                    <Link href={`/vault/${encodeURIComponent(m._id)}`} className="group flex gap-3">
                      <span className="w-20 shrink-0 font-mono text-xs text-info">{formatWhen(m.eventAt)}</span>
                      <span className="text-sm text-muted group-hover:text-fg">{m.statement}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 text-xs text-faint">Current figures are unknown unless you add a newer snapshot.</p>
          </Card>
          <Card className="p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-medium">
              <Radar className="size-4 text-accent" /> Direction, plans & goals
            </h2>
            <ul className="space-y-3">
              {forward.map((m) => (
                <li key={m._id}>
                  <Link href={`/vault/${encodeURIComponent(m._id)}`} className="text-sm text-muted hover:text-fg">
                    {m.statement}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </EntityDetail>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  return { title: (await params).slug.replace(/-/g, " ") };
}
