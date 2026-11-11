import { ArrowLeft, ShieldAlert, Sparkles } from "lucide-react";
import Link from "next/link";
import type { Entity, Memory } from "@/lib/domain";
import { MemoryList } from "@/components/memory/memory-list";
import { SensitiveToggle } from "@/components/memory/sensitive";
import { Timeline } from "@/components/timeline";
import { Badge, buttonVariants, Card } from "@/components/ui";

type Link_ = { label: string; type: string; direction: string; other: Entity | null };

function hrefFor(e: Entity) {
  return e.kind === "project" || e.kind === "organization" ? `/projects/${e.slug}` : `/people/${e.slug}`;
}

export function EntityDetail({
  entity,
  memories,
  links,
  back,
  askPrompt,
  children,
}: {
  entity: Entity;
  memories: Memory[];
  links: Link_[];
  back: { href: string; label: string };
  askPrompt: string;
  children?: React.ReactNode;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const dated = memories.filter((m) => m.eventAt);
  return (
    <div className="space-y-8">
      <Link href={back.href} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="size-4" /> {back.label}
      </Link>
      <header className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between animate-rise">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-faint">
            {entity.kind} · {entity.relationship}
          </p>
          <h1 className="mt-2 font-display text-5xl font-bold tracking-[-0.04em]">{entity.name}</h1>
          {entity.description && <p className="mt-3 max-w-2xl text-[15px] text-muted">{entity.description}</p>}
          {entity.aliases.length > 1 && (
            <p className="mt-2 text-xs text-faint">
              aka {entity.aliases.filter((a) => a !== entity.name).join(", ")}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <SensitiveToggle />
          <Link href={`/?q=${encodeURIComponent(askPrompt)}`} className={buttonVariants({ variant: "primary" })}>
            <Sparkles /> ask about {entity.name.split(" ")[0]}
          </Link>
        </div>
      </header>

      {entity.identityBoundary && (
        <Card className="flex gap-3 border-warn/30 bg-warn/5 p-4 text-sm text-muted">
          <ShieldAlert className="size-5 shrink-0 text-warn" />
          <p>
            <strong className="text-fg">boundary.</strong> shares your old ChatGPT account. their health, politics and creator stuff stays theirs, never mixed into you.
          </p>
        </Card>
      )}

      {links.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {links.map((l, i) =>
            l.other ? (
              <Link key={i} href={hrefFor(l.other)} className="group inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1.5 text-sm hover:border-line-strong">
                <span className="text-fg">{l.other._id === "person:aditya" ? "You" : l.other.name}</span>
                <Badge>{l.label}</Badge>
              </Link>
            ) : null,
          )}
        </div>
      )}

      {children}

      <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr]">
        <section>
          <h2 className="mb-4 text-sm font-medium">timeline</h2>
          {dated.length ? <Timeline memories={dated} order="asc" today={today} /> : <p className="text-sm text-faint">nothing dated yet.</p>}
        </section>
        <section>
          <h2 className="mb-4 text-sm font-medium">everything I know · {memories.length}</h2>
          <MemoryList memories={memories} emptyTitle="Nothing stored yet" />
        </section>
      </div>
    </div>
  );
}
