import { MemoryList } from "@/components/memory/memory-list";
import { MoneyBoard } from "@/components/money-board";
import { PageHeader } from "@/components/ui";
import { entityMap, memoriesWhere } from "@/lib/server/queries";
import { currentBalance, ious, istToday, listGoals, listMoney, monthOf, monthSummary, shiftMonth } from "@/lib/server/money";

export const metadata = { title: "Money" };

export default async function MoneyPage() {
  const month = monthOf(istToday());
  const [summary, entries, debts, goals, entities, remembered, balance] = await Promise.all([
    monthSummary(month),
    listMoney({ from: `${month}-01`, to: `${shiftMonth(month, 1)}-01`, limit: 2000 }),
    ious(),
    listGoals(),
    entityMap().catch(() => ({})),
    memoriesWhere({ section: "money" }, 200).catch(() => []),
    currentBalance(),
  ]);
  const names = Object.fromEntries(Object.entries(entities).map(([id, e]) => [id, e.name]));
  // From his own words in the brain ("25-30 lakh down payment by end of 2026"), only as a prefill he edits.
  const goalSuggestion = goals.length ? null : { name: "pune flat down payment", target: 2_500_000, deadline: "2026-12-31" };
  return (
    <>
      <PageHeader eyebrow="money" title="where it comes from, where it goes.">
        your personal money only: what you pull from zaptick and your other stuff, what you spend, who owes who, and what you&apos;re saving for. just what you log, no bank connected, no guessing.
      </PageHeader>
      <MoneyBoard initial={{ summary, entries, ious: debts, goals, balance }} month={month} names={names} goalSuggestion={goalSuggestion} />
      <section className="mt-12">
        <p className="mb-3 font-mono text-[11.5px] text-faint">{"// what I remember about your money (from your chats, not the ledger)"}</p>
        <MemoryList memories={remembered} emptyHint="nothing yet." />
      </section>
    </>
  );
}
