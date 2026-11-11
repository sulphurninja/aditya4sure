import { MemoryList } from "@/components/memory/memory-list";
import { MoneyBoard } from "@/components/money-board";
import { PageHeader } from "@/components/ui";
import { entityMap, memoriesWhere } from "@/lib/server/queries";
import { AlertTriangle, CheckCircle2, Info, Repeat } from "lucide-react";
import { Card } from "@/components/ui";
import { currentBalance, detectRecurring, ious, istToday, listGoals, listMoney, moneyInsights, monthOf, monthSummary, shiftMonth } from "@/lib/server/money";

export const metadata = { title: "Money" };

export default async function MoneyPage() {
  const month = monthOf(istToday());
  const [summary, entries, debts, goals, entities, remembered, balance, insights, recurring] = await Promise.all([
    monthSummary(month),
    listMoney({ from: `${month}-01`, to: `${shiftMonth(month, 1)}-01`, limit: 2000 }),
    ious(),
    listGoals(),
    entityMap().catch(() => ({})),
    memoriesWhere({ section: "money" }, 200).catch(() => []),
    currentBalance(),
    moneyInsights().catch(() => []),
    detectRecurring().catch(() => []),
  ]);
  const names = Object.fromEntries(Object.entries(entities).map(([id, e]) => [id, e.name]));
  // From his own words in the brain ("25-30 lakh down payment by end of 2026"), only as a prefill he edits.
  const goalSuggestion = goals.length ? null : { name: "pune flat down payment", target: 2_500_000, deadline: "2026-12-31" };
  return (
    <>
      <PageHeader eyebrow="money" title="where it comes from, where it goes.">
        your personal money only: what you pull from zaptick and your other stuff, what you spend, who owes who, and what you&apos;re saving for. just what you log, no bank connected, no guessing.
      </PageHeader>
      {(insights.length > 0 || recurring.length > 0) && (
        <div className="mb-6 grid gap-4 md:grid-cols-2">
          {insights.length > 0 && (
            <Card className="p-5">
              <p className="mb-2 font-mono text-[11px] text-faint">{"// heads-ups"}</p>
              <ul className="space-y-2">
                {insights.map((x, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-muted">
                    {x.level === "warn" ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" /> : x.level === "good" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" /> : <Info className="mt-0.5 size-4 shrink-0 text-info" />}
                    {x.text}
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {recurring.length > 0 && (
            <Card className="p-5">
              <p className="mb-2 font-mono text-[11px] text-faint">{"// recurring, spotted automatically"}</p>
              <ul className="space-y-2">
                {recurring.slice(0, 8).map((r) => (
                  <li key={r.key} className="flex items-center gap-2 text-sm">
                    <Repeat className="size-3.5 shrink-0 text-accent" />
                    <span className="flex-1 text-fg">{r.title}</span>
                    <span className="font-mono text-[12px] text-muted">₹{Math.round(r.amount).toLocaleString("en-IN")}</span>
                    <span className="w-24 text-right font-mono text-[11px] text-faint">{r.dueInDays === 0 ? "today" : r.dueInDays === 1 ? "tomorrow" : `in ${r.dueInDays}d`}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
      <MoneyBoard initial={{ summary, entries, ious: debts, goals, balance }} month={month} names={names} goalSuggestion={goalSuggestion} />
      <section className="mt-12">
        <p className="mb-3 font-mono text-[11.5px] text-faint">{"// what I remember about your money (from your chats, not the ledger)"}</p>
        <MemoryList memories={remembered} emptyHint="nothing yet." />
      </section>
    </>
  );
}
