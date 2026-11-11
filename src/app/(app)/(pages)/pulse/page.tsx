import { ArrowRight, CalendarClock, Database, Inbox, MessageSquare, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Constellation } from "@/components/constellation";
import { MemoryCard } from "@/components/memory/memory-card";
import { Badge, buttonVariants, Card, EmptyState, Stat } from "@/components/ui";
import { SECTION_LABEL } from "@/lib/domain";
import { env } from "@/lib/server/env";
import { graph, overview } from "@/lib/server/queries";
import { cn, formatWhen, relativeDays } from "@/lib/utils";

export const metadata = { title: "Pulse" };

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date()));
  if (h < 5) return "still up";
  if (h < 12) return "gm";
  if (h < 17) return "hey";
  return "evening";
}

export default async function OverviewPage() {
  const [data, edges] = await Promise.all([
    overview().catch(() => null),
    graph()
      .then((g) => g.edges)
      .catch(() => []),
  ]);
  const first = env().OWNER_NAME.split(" ")[0];
  const today = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date());

  if (!data) {
    return <EmptyState title="Can't load your brain right now">Check the MongoDB connection banner above.</EmptyState>;
  }

  const counts = Object.fromEntries(data.byEntity.map((x) => [x._id, x.n]));
  const people = data.entities.filter((e) => e.kind === "person").length - 1;
  const projects = data.entities.filter((e) => e.kind === "project").length;
  const maxSection = Math.max(1, ...data.bySection.map((s) => s.n));

  return (
    <div className="space-y-10">
      <section className="animate-rise">
        <p className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 text-[11px] font-medium text-muted">
          <span className="size-1.5 animate-pulse-soft rounded-full bg-grad" />
          {today}
        </p>
        <h1 className="mt-4 font-display text-5xl font-bold leading-[0.98] tracking-[-0.045em] md:text-7xl">
          {greeting()}, {first}.
          <br />
          <span className="text-grad">{data.total ? "here's your pulse." : "let's fill your brain."}</span>
        </h1>
      </section>

      {data.total === 0 ? (
        <EmptyState
          icon={<Database />}
          title="my brain is empty rn"
          action={
            <Link href="/sources" className={buttonVariants({ variant: "primary" })}>
              import the seed <ArrowRight />
            </Link>
          }
        >
          start with the 92 facts ChatGPT pulled together. you get a dry run first and can skip anything sensitive.
        </EmptyState>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <Stat label="memories" value={data.total} />
            <Stat label="confirmed" value={`${Math.round((data.accepted / Math.max(1, data.total)) * 100)}%`} hint={`${data.accepted} by you`} />
            <Stat label="to review" value={data.pending + data.proposals} hint={<Link className="text-accent" href="/review">open queue →</Link>} />
            <Stat label="people" value={people} />
            <Stat label="projects" value={projects} />
            <Stat label="sensitive" value={data.sensitive} hint="blurred by default" />
          </section>

          <section className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
            <Card className="overflow-hidden p-5">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-medium text-fg">your world</h2>
                <span className="font-mono text-[10.5px] text-faint">people inside, projects outside, numbers are memories</span>
              </div>
              <Constellation entities={data.entities} edges={edges} counts={counts} />
            </Card>

            <div className="space-y-5">
              <Card className="p-5">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-medium">
                  <CalendarClock className="size-4 text-accent" /> coming up
                </h2>
                {data.upcoming.length === 0 ? (
                  <p className="text-sm text-faint">nothing dated coming up.</p>
                ) : (
                  <ul className="space-y-3">
                    {data.upcoming.map((m) => {
                      const d = relativeDays(m.eventAt!);
                      return (
                        <li key={m._id}>
                          <Link href={`/vault/${encodeURIComponent(m._id)}`} className="group flex gap-3">
                            <span className="w-14 shrink-0 font-mono text-xs text-accent">{d === 0 ? "today" : d === 1 ? "tmrw" : `in ${d}d`}</span>
                            <span className={cn("line-clamp-2 text-sm text-muted group-hover:text-fg", m.sensitivity === "sensitive" && "blur-[5px] group-hover:blur-none transition")}>
                              {m.statement}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>

              <Card className="p-5">
                <h2 className="mb-3 text-sm font-medium">what I know, by area</h2>
                <ul className="space-y-2">
                  {data.bySection.slice(0, 9).map((s) => (
                    <li key={s._id} className="flex items-center gap-3 text-xs">
                      <span className="w-32 shrink-0 truncate text-muted">{SECTION_LABEL[s._id] ?? s._id}</span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-panel-2">
                        <span className="block h-full rounded-full bg-linear-to-r from-accent to-accent-2" style={{ width: `${(s.n / maxSection) * 100}%` }} />
                      </span>
                      <span className="w-6 text-right font-mono text-faint">{s.n}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          </section>

          <section className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-medium">lately in your life</h2>
                <Link href="/timeline" className="text-xs text-muted hover:text-fg">
                  full timeline →
                </Link>
              </div>
              <div className="grid gap-3">
                {data.recent.slice(0, 5).map((m) => (
                  <MemoryCard key={m._id} m={m} compact />
                ))}
              </div>
            </div>
            <div className="space-y-5">
              <Card className="p-5">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-medium">
                  <Inbox className="size-4 text-accent" /> Sources
                </h2>
                <ul className="space-y-2.5 text-sm">
                  <li className="flex items-center justify-between">
                    <span className="text-muted">ChatGPT seed</span>
                    {data.lastImport ? <Badge tone="ok">imported {formatWhen(data.lastImport.at)}</Badge> : <Badge>not imported</Badge>}
                  </li>
                  <li className="flex items-center justify-between">
                    <span className="text-muted">ChatGPT archive</span>
                    <Badge>Sprint 2</Badge>
                  </li>
                  <li className="flex items-center justify-between">
                    <Link href="/chats" className="text-muted hover:text-fg">
                      WhatsApp & Instagram chats
                    </Link>
                    {data.threads > 0 ? <Badge tone="ok">{data.threads} imported</Badge> : <Badge tone="accent">ready, import one</Badge>}
                  </li>
                  <li className="flex items-center justify-between">
                    <span className="text-muted">Gmail (5 addresses)</span>
                    <Badge>not connected</Badge>
                  </li>
                </ul>
              </Card>
              <Card className="p-5">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-medium">
                  <MessageSquare className="size-4 text-accent" /> recent chats
                </h2>
                {data.convos.length === 0 ? (
                  <p className="text-sm text-faint">no chats yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {data.convos.map((c) => (
                      <li key={c._id}>
                        <Link href={`/?c=${c._id}`} className="line-clamp-1 text-sm text-muted hover:text-fg">
                          {c.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              <Card className="p-5">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-medium">
                  <ShieldCheck className="size-4 text-accent" /> Activity
                </h2>
                <ul className="space-y-1.5">
                  {data.recentAudit.map((a) => (
                    <li key={a._id} className="flex justify-between gap-3 font-mono text-[11px] text-faint">
                      <span className="truncate">
                        {a.actor} · {a.action}
                      </span>
                      <span className="shrink-0">{a.at.slice(5, 16).replace("T", " ")}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
