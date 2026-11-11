import { BellRing, CalendarDays, PiggyBank, Wallet } from "lucide-react";
import Link from "next/link";
import { TaskBoard } from "@/components/task-board";
import { TodayBrief } from "@/components/today-brief";
import { Card, PageHeader } from "@/components/ui";
import { currentBalance, istToday, listGoals, monthSummary } from "@/lib/server/money";
import { entityMap, memoriesWhere } from "@/lib/server/queries";
import { recentNotifications } from "@/lib/server/reminders";
import { latestRhythms, type RhythmEntry } from "@/lib/server/rhythm";
import { listTasks } from "@/lib/server/tasks";
import { formatWhen } from "@/lib/utils";

export const metadata = { title: "Today" };

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

function shift(day: string, n: number) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

export default async function TodayPage() {
  const today = istToday();
  const hour = Number(new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit" }));
  const [rhythms, tasks, entities, upcoming, balance, month, goals, pings] = await Promise.all([
    latestRhythms(12).catch(() => [] as RhythmEntry[]),
    listTasks({ status: "all", limit: 500 }).catch(() => []),
    entityMap().catch(() => ({})),
    memoriesWhere({ eventAt: { $gte: today, $lte: `${shift(today, 14)}￿` } }, 12).catch(() => []),
    currentBalance().catch(() => null),
    monthSummary().catch(() => null),
    listGoals().catch(() => []),
    recentNotifications(5).catch(() => []),
  ]);
  const names = Object.fromEntries(Object.entries(entities).map(([id, e]) => [id, e.name]));
  const latest: Partial<Record<RhythmEntry["kind"], RhythmEntry>> = {};
  for (const r of rhythms) latest[r.kind] ??= r;
  const pick = (r?: RhythmEntry) => (r ? { kind: r.kind, date: r.date, text: r.text, whatsapp: r.whatsapp, at: r.at } : undefined);
  const weekday = new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long" }).toLowerCase();
  const greeting = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  const flat = goals[0];

  return (
    <>
      <PageHeader eyebrow={`today · ${weekday}`} title={`${greeting}, aditya.`}>
        what&apos;s on, what&apos;s left, what&apos;s coming. the same brief lands on your whatsapp at 8, the wrap-up at 10.
      </PageHeader>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <TodayBrief initial={{ morning: pick(latest.morning), night: pick(latest.night), weekly: pick(latest.weekly) }} defaultKind={hour >= 20 ? "night" : "morning"} />
          <TaskBoard initial={tasks} names={names} />
        </div>

        <div className="space-y-5">
          <Card className="p-5">
            <p className="mb-2 flex items-center gap-1.5 font-mono text-[11px] text-faint">
              <Wallet className="size-3" /> {"// money"}
            </p>
            <p className="font-display text-3xl font-bold tabular-nums tracking-tight">{balance ? inr(balance.amount) : "?"}</p>
            <p className="text-xs text-faint">{balance ? `in hand (you said ${inr(balance.base)} on ${formatWhen(balance.asOf)})` : "tell me what you've got on the money page"}</p>
            {month && (
              <p className="mt-3 text-sm text-muted">
                this month: {inr(month.income)} in, {inr(month.spent)} spent, {inr(month.saved)} saved
              </p>
            )}
            {flat && (
              <div className="mt-3">
                <p className="flex items-center gap-1.5 text-xs text-muted">
                  <PiggyBank className="size-3.5 text-accent" /> {flat.name}: {Math.round(flat.progress * 100)}%{flat.perMonthNeeded ? `, ${inr(flat.perMonthNeeded)}/month to go` : ""}
                </p>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-panel-2">
                  <div className="h-full rounded-full bg-grad" style={{ width: `${Math.max(2, flat.progress * 100)}%` }} />
                </div>
              </div>
            )}
            <Link href="/money" className="mt-3 inline-block text-xs text-accent hover:underline">
              open money
            </Link>
          </Card>

          <Card className="p-5">
            <p className="mb-2 flex items-center gap-1.5 font-mono text-[11px] text-faint">
              <CalendarDays className="size-3" /> {"// next two weeks"}
            </p>
            {upcoming.length === 0 ? (
              <p className="text-sm text-faint">nothing dated. tell me your plans and I&apos;ll keep track.</p>
            ) : (
              <ul className="space-y-2">
                {upcoming
                  .sort((a, b) => (a.eventAt ?? "").localeCompare(b.eventAt ?? ""))
                  .map((m) => (
                    <li key={m._id} className="text-sm">
                      <span className="font-mono text-[11px] text-accent">{m.eventAt === today ? "today" : formatWhen(m.eventAt)}</span>
                      <p className="text-muted">{m.statement.length > 140 ? `${m.statement.slice(0, 139)}…` : m.statement}</p>
                    </li>
                  ))}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <p className="mb-2 flex items-center gap-1.5 font-mono text-[11px] text-faint">
              <BellRing className="size-3" /> {"// last pings"}
            </p>
            {pings.length === 0 ? (
              <p className="text-sm text-faint">no reminders fired yet.</p>
            ) : (
              <ul className="space-y-2">
                {pings.map((n) => (
                  <li key={n._id} className="text-sm text-muted">
                    {n.text.length > 120 ? `${n.text.slice(0, 119)}…` : n.text}
                    <span className="block font-mono text-[10px] text-faint">whatsapp {n.whatsapp}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
