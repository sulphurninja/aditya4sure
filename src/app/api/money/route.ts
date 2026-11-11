import { z } from "zod";
import { MoneyEntryInput } from "@/lib/domain";
import { handle, requireOwnerApi } from "@/lib/server/auth";
import { createMoney, currentBalance, ious, istToday, listGoals, listMoney, monthOf, monthSummary, shiftMonth } from "@/lib/server/money";

export async function GET(req: Request) {
  return handle(async () => {
    await requireOwnerApi(req);
    const raw = new URL(req.url).searchParams.get("month");
    const month = raw && /^\d{4}-\d{2}$/.test(raw) ? raw : monthOf(istToday());
    const [summary, entries, debts, goals, balance] = await Promise.all([
      monthSummary(month),
      listMoney({ from: `${month}-01`, to: `${shiftMonth(month, 1)}-01`, limit: 2000 }),
      ious(),
      listGoals(),
      currentBalance(),
    ]);
    return Response.json({ summary, entries, ious: debts, goals, balance });
  });
}

/** One entry or { entries: [...] } (confirmed drafts from the quick-add parser). */
export async function POST(req: Request) {
  return handle(async () => {
    await requireOwnerApi(req);
    const body = await req.json();
    const list = z.array(MoneyEntryInput).max(20).parse(Array.isArray(body?.entries) ? body.entries : [body]);
    const created = [];
    for (const e of list) created.push(await createMoney({ ...e, via: "app" }));
    return Response.json({ entries: created }, { status: 201 });
  });
}
