import { ArrowLeft, ArrowRight, History } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ReviewBadge, TemporalBadge } from "@/components/memory/memory-card";
import { MemoryActions } from "@/components/memory/memory-actions";
import { Badge, Card } from "@/components/ui";
import { SECTION_LABEL } from "@/lib/domain";
import { memoryHistory } from "@/lib/server/memories";
import { entityMap } from "@/lib/server/queries";
import { formatWhen } from "@/lib/utils";

export const metadata = { title: "Memory" };

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line py-2 text-sm last:border-0">
      <span className="text-faint">{k}</span>
      <span className="text-right text-muted">{v}</span>
    </div>
  );
}

export default async function MemoryPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent((await params).id);
  const [h, ents] = await Promise.all([memoryHistory(id), entityMap()]);
  if (!h) notFound();
  const { memory: m, versions, newer, log } = h;
  const subject = ents[m.subjectId]?.name ?? m.subjectId;

  return (
    <div className="space-y-6">
      <Link href="/vault" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="size-4" /> vault
      </Link>

      {newer && (
        <Link href={`/vault/${encodeURIComponent(newer._id)}`} className="flex items-center justify-between rounded-xl border border-info/30 bg-info/10 px-4 py-3 text-sm text-info">
          this is an old version, you fixed it since. <span className="inline-flex items-center gap-1">see current <ArrowRight className="size-4" /></span>
        </Link>
      )}

      <header className="animate-rise">
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-faint">{SECTION_LABEL[m.section]}</span>
          <span className="text-faint">·</span>
          <span className="font-mono text-[11px] text-faint">{m.type.replace("_", " ")}</span>
          <span className="ml-2 flex flex-wrap gap-1">
            <TemporalBadge m={m} />
            <ReviewBadge m={m} />
            {m.sensitivity === "sensitive" && <Badge tone="sensitive">sensitive</Badge>}
            {m.status !== "active" && <Badge tone="danger">{m.status}</Badge>}
            {m.pinned && <Badge tone="accent">pinned</Badge>}
          </span>
        </div>
        <h1 className="max-w-3xl font-display text-3xl font-bold leading-snug tracking-[-0.03em] md:text-4xl">{m.statement}</h1>
      </header>

      <MemoryActions m={m} />

      {m.reviewNotes.length > 0 && (
        <Card className="border-warn/20 bg-warn/5 p-4">
          <p className="mb-2 font-mono text-[10.5px] uppercase tracking-wider text-warn">heads up</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
            {m.reviewNotes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-2 text-sm font-medium">about this memory</h2>
          <Row k="About" v={<Link className="hover:text-fg" href={`/people/${ents[m.subjectId]?.slug ?? ""}`}>{subject}</Link>} />
          <Row k="Happened / applies" v={formatWhen(m.eventAt)} />
          <Row k="Recorded" v={formatWhen(m.observedAt)} />
          <Row k="Valid" v={`${m.validFrom ? formatWhen(m.validFrom) : "?"} → ${m.validTo ? formatWhen(m.validTo) : "now / unknown"}`} />
          <Row k="Confidence" v={`${Math.round(m.confidence * 100)}%`} />
          <Row k="Inferred" v={m.isInferred ? "yes, my interpretation" : "no, you said it"} />
          <Row k="Origin" v={m.provenance.origin.replace("_", " ")} />
          {m.provenance.seedId && <Row k="Seed" v={`${m.provenance.seedId} · ${m.provenance.seedStatus} · ${m.provenance.seedConfidence}`} />}
          <Row k="Version" v={`v${m.version}`} />
          <Row k="ID" v={<span className="font-mono text-xs">{m._id}</span>} />
          {m.entityIds.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {m.entityIds.map((e) => {
                const ent = ents[e];
                if (!ent) return null;
                const href = ent.kind === "project" || ent.kind === "organization" ? `/projects/${ent.slug}` : `/people/${ent.slug}`;
                return (
                  <Link key={e} href={href} className="rounded-full border border-line px-2.5 py-0.5 text-xs text-muted hover:border-line-strong hover:text-fg">
                    {ent.name}
                  </Link>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="mb-3 text-sm font-medium">where it came from</h2>
          <ul className="space-y-3">
            {m.sources.map((s, i) => (
              <li key={i} className="rounded-2xl bg-panel-2 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-fg">{s.label}</span>
                  <Badge>{s.kind}</Badge>
                </div>
                {s.excerpt && <blockquote className="mt-2 border-l-2 border-accent/50 pl-3 text-sm text-muted">“{s.excerpt}”</blockquote>}
                <p className="mt-2 font-mono text-[10.5px] text-faint">
                  {s.ref}
                  {s.at ? ` · ${formatWhen(s.at)}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {versions.length > 0 && (
        <Card className="p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-medium">
            <History className="size-4 text-accent" /> older versions
          </h2>
          <ul className="space-y-2">
            {versions.map((v) => (
              <li key={v._id} className="text-sm text-faint line-through decoration-faint/50">
                <Link href={`/vault/${encodeURIComponent(v._id)}`} className="hover:text-muted">
                  v{v.version}: {v.statement}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-medium">history</h2>
        {log.length === 0 ? (
          <p className="text-sm text-faint">no changes yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {log.map((a) => (
              <li key={a._id} className="flex justify-between gap-4 font-mono text-[11px] text-faint">
                <span>
                  {a.actor} · {a.action}
                  {a.changedFields?.length ? ` (${a.changedFields.join(", ")})` : ""}
                  {a.note ? ` · ${a.note}` : ""}
                </span>
                <span className="shrink-0">{a.at.slice(0, 16).replace("T", " ")}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
