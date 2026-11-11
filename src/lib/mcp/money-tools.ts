import "server-only";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MONEY_CATEGORIES, MONEY_KINDS, type MoneyEntry } from "@/lib/domain";
import { createGoal, createMoney, currentBalance, deleteMoney, ious, setBalance, istToday, listGoals, listMoney, monthOf, monthSummary, shiftMonth, updateGoal, updateMoney } from "@/lib/server/money";

const text = (s: string) => ({ content: [{ type: "text" as const, text: s }] });
const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function line(e: MoneyEntry) {
  const meta = [e.kind, e.category, e.source, e.counterparty, e.account, e.status === "expected" ? "EXPECTED" : null, e.foreign ? `${e.foreign.amount} ${e.foreign.currency}` : null].filter(Boolean).join(", ");
  return `[${e._id}] ${e.date} ${inr(e.amount)} ${e.title} (${meta})`;
}

/** Personal money: what he pulls from his companies, other income, spending, IOUs, savings goals. Never moves money. */
export function registerMoneyTools(server: McpServer) {
  server.registerTool(
    "log_money",
    {
      title: "Log money in/out",
      description:
        "Add entries to Aditya's PERSONAL money ledger (not company revenue). Only log what he told you or confirmed. kinds: income (payout he took from Zaptick/Ocean Linux, client money, gifts), expense, lent, borrowed, got_back (someone repaid him), paid_back (he repaid), saving (SIP, flat fund, money sent to Komal to save). Amounts in rupees; for USD/USDT ask him the rupee value or use the rate he gives. status=expected for money that's coming or due but not here yet.",
      inputSchema: {
        entries: z
          .array(
            z.object({
              kind: z.enum(MONEY_KINDS),
              amount: z.number().positive().describe("Rupees"),
              date: ymd.optional().describe("Default today (IST)"),
              title: z.string().min(1).max(200),
              source: z.string().max(80).optional().describe("For income: Zaptick, Ocean Linux, a client..."),
              category: z.enum(MONEY_CATEGORIES).optional().describe("For expenses"),
              counterparty: z.string().max(80).optional().describe("Person for IOUs/gifts/transfers, e.g. 'umesh', 'komal'"),
              account: z.string().max(40).optional().describe("kotak, cash, usdt..."),
              goal_id: z.string().max(80).optional().describe("For saving entries: which goal (see money_overview)"),
              status: z.enum(["done", "expected"]).default("done"),
              foreign_amount: z.number().positive().optional(),
              foreign_currency: z.string().max(8).optional(),
              note: z.string().max(500).optional(),
            }),
          )
          .min(1)
          .max(20),
      },
    },
    async ({ entries }) => {
      const out: string[] = [];
      for (const e of entries) {
        const doc = await createMoney(
          {
            kind: e.kind,
            amount: e.amount,
            date: e.date ?? istToday(),
            title: e.title,
            source: e.source ?? null,
            category: e.category ?? null,
            counterparty: e.counterparty ?? null,
            account: e.account ?? null,
            goalId: e.goal_id ?? null,
            status: e.status,
            foreign: e.foreign_amount && e.foreign_currency ? { amount: e.foreign_amount, currency: e.foreign_currency } : null,
            note: e.note ?? null,
            via: "claude",
          },
          "ai",
        );
        out.push(line(doc));
      }
      return text(`logged:\n${out.join("\n")}`);
    },
  );

  server.registerTool(
    "money_overview",
    {
      title: "Money this month",
      description: "His personal money for a month: in, spent, saved, left over, by source and category, vs last month, plus who owes whom and savings goals with how much he needs per month.",
      inputSchema: { month: z.string().regex(/^\d{4}-\d{2}$/).optional().describe("YYYY-MM, default this month") },
      annotations: { readOnlyHint: true },
    },
    async ({ month }) => {
      const m = month ?? monthOf(istToday());
      const [s, debts, goals, bal] = await Promise.all([monthSummary(m), ious(), listGoals(), currentBalance()]);
      return text(
        [
          bal ? `in hand now: about ${inr(bal.amount)} (he said ${inr(bal.base)} on ${bal.asOf}, ${bal.entriesSince} entries logged since)` : "in hand now: unknown (he hasn't set it; ask him and use set_balance)",
          `${m}: came in ${inr(s.income)}, spent ${inr(s.spent)}, saved ${inr(s.saved)}, left over ${inr(s.net)}. (last month: in ${inr(s.prev.income)}, spent ${inr(s.prev.spent)}, saved ${inr(s.prev.saved)})`,
          s.expectedIn || s.expectedOut ? `still expected this month: ${inr(s.expectedIn)} in, ${inr(s.expectedOut)} out` : null,
          `income by source: ${s.bySource.map((x) => `${x.name} ${inr(x.amount)}`).join(", ") || "none logged"}`,
          `spending by category: ${s.byCategory.map((x) => `${x.name} ${inr(x.amount)}`).join(", ") || "none logged"}`,
          s.biggest.length ? `biggest spends: ${s.biggest.map((e) => `${e.title} ${inr(e.amount)}`).join(", ")}` : null,
          `owed to him: ${debts.filter((d) => d.net > 0).map((d) => `${d.counterparty} ${inr(d.net)}`).join(", ") || "nobody"}`,
          `he owes: ${debts.filter((d) => d.net < 0).map((d) => `${d.counterparty} ${inr(-d.net)}`).join(", ") || "nobody"}`,
          `goals: ${goals.map((g) => `[${g._id}] ${g.name} ${inr(g.saved)}/${inr(g.target)} (${Math.round(g.progress * 100)}%)${g.deadline ? `, by ${g.deadline}, needs ${inr(g.perMonthNeeded ?? 0)}/month` : ""}`).join("; ") || "none set"}`,
          `entries logged: ${s.count}. This is only what he logged; no bank is connected.`,
        ]
          .filter(Boolean)
          .join("\n"),
      );
    },
  );

  server.registerTool(
    "set_balance",
    {
      title: "How much he has right now",
      description: "When he says how much money he has right now ('left with 14k', 'I have 2L in total'), record it. Later logged entries move it up/down automatically.",
      inputSchema: { amount: z.number().describe("Rupees, all of it (bank + cash + upi) unless he says otherwise"), date: ymd.optional().describe("Default today") },
    },
    async ({ amount, date }) => {
      await setBalance({ amount, date: date ?? istToday(), via: "claude" }, "ai");
      return text(`noted: ${inr(amount)} as of ${date ?? istToday()}`);
    },
  );

  server.registerTool(
    "list_money",
    {
      title: "Find money entries",
      description: "List ledger entries by month, kind, person or text. Returns ids for update_money / delete_money.",
      inputSchema: {
        month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
        kind: z.enum(MONEY_KINDS).optional(),
        person: z.string().max(80).optional(),
        text: z.string().max(100).optional(),
        expected_only: z.boolean().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ month, kind, person, text: q, expected_only }) => {
      const rows = await listMoney({
        ...(month ? { from: `${month}-01`, to: `${shiftMonth(month, 1)}-01` } : {}),
        kind,
        counterparty: person,
        q,
        status: expected_only ? "expected" : undefined,
        limit: 100,
      });
      return text(rows.map(line).join("\n") || "nothing.");
    },
  );

  server.registerTool(
    "update_money",
    {
      title: "Fix a money entry",
      description: "Change an entry (wrong amount, date, category) or mark an expected one as done when the money actually came/went.",
      inputSchema: {
        id: z.string().min(4).max(80),
        amount: z.number().positive().optional(),
        date: ymd.optional(),
        title: z.string().min(1).max(200).optional(),
        category: z.enum(MONEY_CATEGORIES).optional(),
        status: z.enum(["done", "expected"]).optional(),
        note: z.string().max(500).optional(),
      },
    },
    async ({ id, ...patch }) => text(`updated ${line(await updateMoney(id, patch, "ai"))}`),
  );

  server.registerTool(
    "delete_money",
    {
      title: "Delete a money entry",
      description: "Delete a ledger entry. Only when Aditya explicitly asked in this conversation.",
      inputSchema: { id: z.string().min(4).max(80) },
      annotations: { destructiveHint: true },
    },
    async ({ id }) => {
      await deleteMoney(id, "ai");
      return text("deleted.");
    },
  );

  server.registerTool(
    "money_goal",
    {
      title: "Set or change a savings goal",
      description: "Create a savings goal (flat down payment, emergency fund, trip) or update one (target, deadline, starting amount, mark done). Add money to a goal with log_money kind=saving + goal_id.",
      inputSchema: {
        id: z.string().max(80).optional().describe("Omit to create a new goal"),
        name: z.string().min(2).max(80).optional(),
        target: z.number().positive().optional().describe("Rupees"),
        starting_amount: z.number().min(0).optional().describe("What he already has saved toward it"),
        deadline: ymd.optional(),
        status: z.enum(["active", "done", "dropped"]).optional(),
      },
    },
    async ({ id, name, target, starting_amount, deadline, status }) => {
      if (!id) {
        if (!name || !target) return text("need a name and a target to create a goal.");
        const g = await createGoal({ name, target, startingAmount: starting_amount ?? 0, deadline: deadline ?? null }, "ai");
        return text(`goal created [${g._id}] ${g.name} ${inr(g.target)}`);
      }
      const g = await updateGoal(id, { name, target, startingAmount: starting_amount, deadline, status }, "ai");
      return text(`goal updated [${g._id}] ${g.name} ${inr(g.target)} ${g.status}`);
    },
  );
}
