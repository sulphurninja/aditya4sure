"use client";

import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  HandCoins,
  Loader2,
  Pencil,
  Wallet,
  PiggyBank,
  Plus,
  Sparkles,
  Target,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  MONEY_CATEGORIES,
  MONEY_KINDS,
  type MoneyEntry,
  type MoneyKind,
} from "@/lib/domain";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Select,
  Stat,
  Textarea,
} from "@/components/ui";
import { api, cn, formatWhen } from "@/lib/utils";
import type {
  BalanceView,
  GoalView,
  Iou,
  MonthSummary,
} from "@/lib/server/money";

export type MoneyData = {
  summary: MonthSummary;
  entries: MoneyEntry[];
  ious: Iou[];
  goals: GoalView[];
  balance: BalanceView | null;
};

type GoalDraft = {
  name: string;
  target_inr: number;
  deadline: string | null;
  already_saved_inr: number | null;
};

type Draft = {
  kind: MoneyKind;
  amount_inr: number | null;
  foreign_amount: number | null;
  foreign_currency: string | null;
  date: string;
  title: string;
  source: string | null;
  category: (typeof MONEY_CATEGORIES)[number] | null;
  counterparty: string | null;
  account: string | null;
  status: "done" | "expected";
  note: string | null;
};

const KIND_LABEL: Record<MoneyKind, string> = {
  income: "got paid",
  expense: "spent",
  lent: "lent",
  borrowed: "borrowed",
  got_back: "got back",
  paid_back: "paid back",
  saving: "saved",
};

const IN_KINDS: MoneyKind[] = ["income", "borrowed", "got_back"];

export const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

function shiftMonth(month: string, by: number) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
}

function monthLabel(month: string) {
  return new Date(`${month}-01T12:00:00Z`)
    .toLocaleDateString("en-IN", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    })
    .toLowerCase();
}

function istToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function Bars({
  title,
  rows,
  tone,
}: {
  title: string;
  rows: { name: string; amount: number }[];
  tone: "in" | "out";
}) {
  const max = Math.max(1, ...rows.map((r) => r.amount));
  return (
    <Card className="p-5">
      <p className="mb-3 font-mono text-[11px] text-faint">{`// ${title}`}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-faint">nothing logged yet.</p>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((r) => (
            <li key={r.name}>
              <div className="mb-1 flex justify-between text-[13px]">
                <span className="text-muted">{r.name}</span>
                <span className="font-mono tabular-nums text-fg">
                  {inr(r.amount)}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-panel-2">
                <div
                  className={cn(
                    "h-full rounded-full",
                    tone === "in" ? "bg-ok/70" : "bg-accent/70",
                  )}
                  style={{ width: `${Math.max(3, (r.amount / max) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function DraftCard({
  d,
  onChange,
  onRemove,
}: {
  d: Draft;
  onChange: (d: Draft) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line-strong bg-panel px-3 py-2">
      <Select
        value={d.kind}
        onChange={(e) => onChange({ ...d, kind: e.target.value as MoneyKind })}
        className="h-8 text-xs"
        aria-label="kind"
      >
        {MONEY_KINDS.map((k) => (
          <option key={k} value={k}>
            {KIND_LABEL[k]}
          </option>
        ))}
      </Select>
      <Input
        type="number"
        value={d.amount_inr ?? ""}
        placeholder={
          d.foreign_currency
            ? `₹ for ${d.foreign_amount} ${d.foreign_currency}`
            : "₹"
        }
        onChange={(e) =>
          onChange({
            ...d,
            amount_inr: e.target.value ? Number(e.target.value) : null,
          })
        }
        className={cn(
          "h-8 w-32 text-xs",
          d.amount_inr == null && "border-warn",
        )}
        aria-label="amount in rupees"
      />
      <Input
        value={d.title}
        onChange={(e) => onChange({ ...d, title: e.target.value })}
        className="h-8 min-w-40 flex-1 text-xs"
        aria-label="what"
      />
      {d.kind === "expense" && (
        <Select
          value={d.category ?? "other"}
          onChange={(e) =>
            onChange({ ...d, category: e.target.value as Draft["category"] })
          }
          className="h-8 text-xs"
          aria-label="category"
        >
          {MONEY_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      )}
      {d.source && <Badge tone="ok">{d.source}</Badge>}
      {d.counterparty && <Badge tone="accent">{d.counterparty}</Badge>}
      <Input
        type="date"
        value={d.date}
        onChange={(e) => onChange({ ...d, date: e.target.value })}
        className="h-8 w-auto text-xs"
        aria-label="date"
      />
      {d.status === "expected" && <Badge tone="warn">expected</Badge>}
      <button
        type="button"
        onClick={onRemove}
        aria-label="remove"
        className="text-faint hover:text-danger"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

export function MoneyBoard({
  initial,
  month: initialMonth,
  names,
  goalSuggestion,
}: {
  initial: MoneyData;
  month: string;
  names: Record<string, string>;
  goalSuggestion: { name: string; target: number; deadline: string } | null;
}) {
  const [data, setData] = useState(initial);
  const [month, setMonth] = useState(initialMonth);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [goalDrafts, setGoalDrafts] = useState<GoalDraft[]>([]);
  const [balanceDraft, setBalanceDraft] = useState<{
    amount_inr: number;
    date: string;
  } | null>(null);
  const [balanceEdit, setBalanceEdit] = useState<{
    amount: string;
    date: string;
  } | null>(null);
  const [goalEdit, setGoalEdit] = useState<{
    id: string;
    name: string;
    target: string;
    startingAmount: string;
    deadline: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [goalForm, setGoalForm] = useState<{
    name: string;
    target: string;
    startingAmount: string;
    deadline: string;
  } | null>(null);
  const [contrib, setContrib] = useState<Record<string, string>>({});
  const who = (c: string | null) =>
    c ? (names[c] ?? c.replace(/^person:/, "")) : "";

  async function load(m: string) {
    setLoading(true);
    try {
      setData(await api<MoneyData>(`/api/money?month=${m}`));
      setMonth(m);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed");
    } finally {
      setLoading(false);
    }
  }

  async function parse(e: React.FormEvent) {
    e.preventDefault();
    if (text.trim().length < 2) return;
    setBusy(true);
    try {
      const { drafts, goals, balance } = await api<{
        drafts: Draft[];
        goals: GoalDraft[];
        balance: { amount_inr: number; date: string } | null;
      }>("/api/money/parse", {
        method: "POST",
        json: { text },
      });
      if (!drafts.length && !goals.length && !balance)
        toast("couldn't find any money or goal in that");
      setDrafts(drafts);
      setGoalDrafts(goals);
      setBalanceDraft(balance);
      if (!drafts.length && (goals.length || balance)) setText("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveDrafts() {
    if (drafts.some((d) => !d.amount_inr || d.amount_inr <= 0))
      return toast.error("fill the rupee amount for each one");
    setBusy(true);
    try {
      await api("/api/money", {
        method: "POST",
        json: {
          entries: drafts.map((d) => ({
            kind: d.kind,
            amount: d.amount_inr,
            foreign:
              d.foreign_amount && d.foreign_currency
                ? { amount: d.foreign_amount, currency: d.foreign_currency }
                : null,
            date: d.date,
            title: d.title,
            source: d.source,
            category: d.category,
            counterparty: d.counterparty,
            account: d.account,
            status: d.status,
            note: d.note,
          })),
        },
      });
      toast.success(drafts.length === 1 ? "logged" : `logged ${drafts.length}`);
      setDrafts([]);
      setText("");
      await load(month);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(e: MoneyEntry) {
    if (!confirm(`delete "${e.title}" (${inr(e.amount)})?`)) return;
    try {
      await api(`/api/money/${e._id}`, {
        method: "DELETE",
        headers: { "x-confirm-delete": "yes" },
      });
      await load(month);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed");
    }
  }

  async function markDone(e: MoneyEntry) {
    try {
      await api(`/api/money/${e._id}`, {
        method: "PATCH",
        json: {
          status: "done",
          date: e.date > istToday() ? istToday() : e.date,
        },
      });
      toast.success("nice, marked done");
      await load(month);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed");
    }
  }

  async function settle(d: Iou) {
    const owedToMe = d.net > 0;
    if (
      !confirm(
        owedToMe
          ? `${who(d.counterparty)} paid back ${inr(d.net)}?`
          : `you paid ${who(d.counterparty)} back ${inr(-d.net)}?`,
      )
    )
      return;
    try {
      await api("/api/money", {
        method: "POST",
        json: {
          kind: owedToMe ? "got_back" : "paid_back",
          amount: Math.abs(d.net),
          date: istToday(),
          title: owedToMe
            ? `${who(d.counterparty)} paid back`
            : `paid ${who(d.counterparty)} back`,
          counterparty: d.counterparty,
        },
      });
      toast.success("settled");
      await load(month);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed");
    }
  }

  async function saveGoal(e: React.FormEvent) {
    e.preventDefault();
    if (!goalForm) return;
    try {
      await api("/api/money/goals", {
        method: "POST",
        json: {
          name: goalForm.name,
          target: Number(goalForm.target),
          startingAmount: Number(goalForm.startingAmount || 0),
          deadline: goalForm.deadline || null,
        },
      });
      setGoalForm(null);
      await load(month);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed");
    }
  }

  async function saveBalance(amount: number, date: string) {
    if (!Number.isFinite(amount)) return toast.error("how much though?");
    try {
      await api("/api/money/balance", {
        method: "POST",
        json: { amount, date },
      });
      setBalanceDraft(null);
      setBalanceEdit(null);
      toast.success("got it, I'll keep it updated from here");
      await load(month);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed");
    }
  }

  async function saveGoalEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!goalEdit) return;
    try {
      await api(`/api/money/goals/${goalEdit.id}`, {
        method: "PATCH",
        json: {
          name: goalEdit.name,
          target: Number(goalEdit.target),
          startingAmount: Number(goalEdit.startingAmount || 0),
          deadline: goalEdit.deadline || null,
        },
      });
      setGoalEdit(null);
      await load(month);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed");
    }
  }

  async function closeGoal(g: GoalView, how: "done" | "delete") {
    if (
      how === "delete" &&
      !confirm(`delete "${g.name}"? money you put in stays in the ledger.`)
    )
      return;
    try {
      if (how === "done")
        await api(`/api/money/goals/${g._id}`, {
          method: "PATCH",
          json: { status: "done" },
        });
      else
        await api(`/api/money/goals/${g._id}`, {
          method: "DELETE",
          headers: { "x-confirm-delete": "yes" },
        });
      if (how === "done") toast.success("goal smashed");
      setGoalEdit(null);
      await load(month);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed");
    }
  }

  async function confirmGoal(g: GoalDraft, i: number) {
    try {
      await api("/api/money/goals", {
        method: "POST",
        json: {
          name: g.name,
          target: g.target_inr,
          startingAmount: g.already_saved_inr ?? 0,
          deadline: g.deadline,
        },
      });
      setGoalDrafts((all) => all.filter((_, j) => j !== i));
      toast.success("goal set, let's go");
      await load(month);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed");
    }
  }

  async function addToGoal(g: GoalView) {
    const amount = Number(contrib[g._id]);
    if (!amount || amount <= 0) return;
    try {
      await api("/api/money", {
        method: "POST",
        json: {
          kind: "saving",
          amount,
          date: istToday(),
          title: `into ${g.name}`,
          goalId: g._id,
        },
      });
      setContrib((c) => ({ ...c, [g._id]: "" }));
      toast.success(`${inr(amount)} closer`);
      await load(month);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed");
    }
  }

  const s = data.summary;
  const delta = (now: number, before: number) =>
    before
      ? `${now >= before ? "+" : ""}${Math.round(((now - before) / before) * 100)}% vs last month`
      : "nothing last month";
  const expected = data.entries.filter((e) => e.status === "expected");
  const done = data.entries.filter((e) => e.status === "done");
  const byDay = new Map<string, MoneyEntry[]>();
  for (const e of done) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);

  return (
    <div className="space-y-6">
      <Card className="p-4 transition focus-within:border-accent-line focus-within:shadow-[0_0_0_3px_var(--accent-soft)]">
        <form onSubmit={parse} className="space-y-3">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-2.5 size-4 shrink-0 text-accent" />
            <Textarea
              rows={2}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder="just type it. 'spent 450 on uber, 1.2k dinner with komal, zaptick payout 80k coming on 30th, umesh owes me 10k'"
              className="border-transparent bg-transparent text-[15px] hover:border-transparent focus:border-transparent focus:ring-0"
              maxLength={2000}
            />
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={busy || text.trim().length < 2}
              className="mt-1"
            >
              {busy && !drafts.length ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Plus />
              )}{" "}
              log
            </Button>
          </div>
          {drafts.length > 0 && (
            <div className="space-y-2 border-t border-line pt-3">
              <p className="font-mono text-[11px] text-faint">
                {"// check these, then save"}
              </p>
              {drafts.map((d, i) => (
                <DraftCard
                  key={i}
                  d={d}
                  onChange={(nd) =>
                    setDrafts((all) => all.map((x, j) => (j === i ? nd : x)))
                  }
                  onRemove={() =>
                    setDrafts((all) => all.filter((_, j) => j !== i))
                  }
                />
              ))}
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  type="button"
                  onClick={() => setDrafts([])}
                >
                  nah
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  type="button"
                  onClick={saveDrafts}
                  disabled={busy}
                >
                  {busy ? <Loader2 className="animate-spin" /> : <Check />} save{" "}
                  {drafts.length > 1 ? `all ${drafts.length}` : ""}
                </Button>
              </div>
            </div>
          )}
          {goalDrafts.map((g, i) => (
            <div
              key={i}
              className="flex flex-wrap items-center gap-2 rounded-2xl border border-accent-line bg-accent-soft px-3 py-2"
            >
              <Target className="size-4 text-accent" />
              <Input
                value={g.name}
                onChange={(e) =>
                  setGoalDrafts((all) =>
                    all.map((x, j) =>
                      j === i ? { ...x, name: e.target.value } : x,
                    ),
                  )
                }
                className="h-8 min-w-40 flex-1 text-xs"
                aria-label="goal name"
              />
              <Input
                type="number"
                value={g.target_inr}
                onChange={(e) =>
                  setGoalDrafts((all) =>
                    all.map((x, j) =>
                      j === i
                        ? { ...x, target_inr: Number(e.target.value) }
                        : x,
                    ),
                  )
                }
                className="h-8 w-32 text-xs"
                aria-label="target"
              />
              <Input
                type="number"
                value={g.already_saved_inr ?? ""}
                placeholder="already have ₹"
                onChange={(e) =>
                  setGoalDrafts((all) =>
                    all.map((x, j) =>
                      j === i
                        ? {
                            ...x,
                            already_saved_inr: e.target.value
                              ? Number(e.target.value)
                              : null,
                          }
                        : x,
                    ),
                  )
                }
                className="h-8 w-32 text-xs"
                aria-label="already saved"
              />
              <Input
                type="date"
                value={g.deadline ?? ""}
                onChange={(e) =>
                  setGoalDrafts((all) =>
                    all.map((x, j) =>
                      j === i ? { ...x, deadline: e.target.value || null } : x,
                    ),
                  )
                }
                className="h-8 w-auto text-xs"
                aria-label="deadline"
              />
              <Button
                type="button"
                size="sm"
                variant="primary"
                onClick={() => confirmGoal(g, i)}
              >
                <Target /> set goal
              </Button>
              <button
                type="button"
                onClick={() =>
                  setGoalDrafts((all) => all.filter((_, j) => j !== i))
                }
                aria-label="dismiss"
                className="text-faint hover:text-danger"
              >
                <X className="size-4" />
              </button>
            </div>
          ))}
          {balanceDraft && (
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-ok/30 bg-ok/8 px-3 py-2">
              <Wallet className="size-4 text-ok" />
              <span className="text-sm text-fg">you have</span>
              <Input
                type="number"
                value={balanceDraft.amount_inr}
                onChange={(e) =>
                  setBalanceDraft({
                    ...balanceDraft,
                    amount_inr: Number(e.target.value),
                  })
                }
                className="h-8 w-32 text-xs"
                aria-label="amount you have"
              />
              <span className="text-sm text-fg">as of</span>
              <Input
                type="date"
                value={balanceDraft.date}
                onChange={(e) =>
                  setBalanceDraft({ ...balanceDraft, date: e.target.value })
                }
                className="h-8 w-auto text-xs"
                aria-label="as of"
              />
              <Button
                type="button"
                size="sm"
                variant="primary"
                onClick={() =>
                  saveBalance(balanceDraft.amount_inr, balanceDraft.date)
                }
              >
                <Check /> that&apos;s right
              </Button>
              <button
                type="button"
                onClick={() => setBalanceDraft(null)}
                aria-label="dismiss"
                className="text-faint hover:text-danger"
              >
                <X className="size-4" />
              </button>
            </div>
          )}
        </form>
      </Card>

      <Card className="flex flex-col gap-4 p-6 md:flex-row md:items-center">
        <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-ok/12 text-ok">
          <Wallet className="size-6" />
        </div>
        <div className="flex-1">
          <p className="font-mono text-[11px] text-faint">
            {"// in hand right now"}
          </p>
          {data.balance ? (
            <>
              <p
                className={cn(
                  "font-display text-4xl font-bold tabular-nums tracking-tight",
                  data.balance.amount < 0 ? "text-danger" : "text-fg",
                )}
              >
                {inr(data.balance.amount)}
              </p>
              <p className="mt-1 text-xs text-faint">
                you said {inr(data.balance.base)} on{" "}
                {formatWhen(data.balance.asOf)}
                {data.balance.entriesSince
                  ? `, then ${data.balance.change >= 0 ? "+" : "-"}${inr(Math.abs(data.balance.change))} from ${data.balance.entriesSince} ${data.balance.entriesSince === 1 ? "entry" : "entries"} since`
                  : ", nothing logged since"}
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm text-muted">
              no idea yet. tell me what you&apos;ve got right now (bank + cash +
              upi) and I&apos;ll keep it moving with everything you log.
            </p>
          )}
        </div>
        {balanceEdit ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveBalance(Number(balanceEdit.amount), balanceEdit.date);
            }}
            className="flex flex-wrap items-center gap-2"
          >
            <Input
              type="number"
              autoFocus
              value={balanceEdit.amount}
              onChange={(e) =>
                setBalanceEdit({ ...balanceEdit, amount: e.target.value })
              }
              placeholder="₹ you have"
              className="h-9 w-36 text-sm"
              aria-label="amount you have"
              required
            />
            <Input
              type="date"
              value={balanceEdit.date}
              onChange={(e) =>
                setBalanceEdit({ ...balanceEdit, date: e.target.value })
              }
              className="h-9 w-auto text-sm"
              aria-label="as of"
            />
            <Button type="submit" size="sm" variant="primary">
              <Check /> set
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setBalanceEdit(null)}
              aria-label="cancel"
            >
              <X />
            </Button>
          </form>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setBalanceEdit({ amount: "", date: istToday() })}
          >
            <Pencil /> {data.balance ? "correct it" : "set it"}
          </Button>
        )}
      </Card>

      <div className="flex items-center gap-3">
        <Button
          size="icon"
          variant="ghost"
          onClick={() => load(shiftMonth(month, -1))}
          aria-label="previous month"
          disabled={loading}
        >
          <ChevronLeft />
        </Button>
        <p className="min-w-40 text-center font-display text-lg font-semibold">
          {monthLabel(month)}
        </p>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => load(shiftMonth(month, 1))}
          aria-label="next month"
          disabled={loading}
        >
          <ChevronRight />
        </Button>
        {loading && <Loader2 className="size-4 animate-spin text-faint" />}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="came in"
          value={inr(s.income)}
          hint={delta(s.income, s.prev.income)}
        />
        <Stat
          label="spent"
          value={inr(s.spent)}
          hint={delta(s.spent, s.prev.spent)}
        />
        <Stat
          label="saved"
          value={inr(s.saved)}
          hint={
            s.income
              ? `${Math.round((s.saved / s.income) * 100)}% of what came in`
              : "log income to see the rate"
          }
        />
        <Stat
          label="left over"
          value={
            <span className={s.net < 0 ? "text-danger" : ""}>{inr(s.net)}</span>
          }
          hint={
            s.expectedIn || s.expectedOut
              ? `${inr(s.expectedIn)} still coming, ${inr(s.expectedOut)} still to go`
              : "in minus spent minus saved"
          }
        />
      </div>

      <Card className="p-5">
        <div className="mb-3 flex items-center">
          <p className="flex-1 font-mono text-[11px] text-faint">
            {"// saving for"}
          </p>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              setGoalForm(
                goalForm
                  ? null
                  : {
                      name: goalSuggestion?.name ?? "",
                      target: goalSuggestion
                        ? String(goalSuggestion.target)
                        : "",
                      startingAmount: "",
                      deadline: goalSuggestion?.deadline ?? "",
                    },
              )
            }
          >
            <Plus /> goal
          </Button>
        </div>
        {goalForm && (
          <form
            onSubmit={saveGoal}
            className="mb-4 space-y-2 rounded-2xl border border-line-strong p-3"
          >
            <Input
              value={goalForm.name}
              onChange={(e) =>
                setGoalForm({ ...goalForm, name: e.target.value })
              }
              placeholder="pune flat down payment"
              className="h-9 text-sm"
              required
            />
            <div className="flex gap-2">
              <Input
                type="number"
                value={goalForm.target}
                onChange={(e) =>
                  setGoalForm({ ...goalForm, target: e.target.value })
                }
                placeholder="target ₹"
                className="h-9 text-sm"
                required
              />
              <Input
                type="number"
                value={goalForm.startingAmount}
                onChange={(e) =>
                  setGoalForm({ ...goalForm, startingAmount: e.target.value })
                }
                placeholder="already have ₹"
                className="h-9 text-sm"
              />
            </div>
            <Input
              type="date"
              value={goalForm.deadline}
              onChange={(e) =>
                setGoalForm({ ...goalForm, deadline: e.target.value })
              }
              className="h-9 text-sm"
              aria-label="deadline"
            />
            <Button
              type="submit"
              size="sm"
              variant="primary"
              className="w-full"
            >
              <Target /> set it
            </Button>
          </form>
        )}
        {data.goals.length === 0 && !goalForm ? (
          <p className="text-sm text-faint">
            no goals yet. the flat is calling.
          </p>
        ) : (
          <ul className="grid gap-5 md:grid-cols-2">
            {data.goals.map((g) => (
              <li key={g._id} className="group">
                {goalEdit?.id === g._id ? (
                  <form
                    onSubmit={saveGoalEdit}
                    className="space-y-2 rounded-2xl border border-line-strong p-3"
                  >
                    <Input
                      value={goalEdit.name}
                      onChange={(e) =>
                        setGoalEdit({ ...goalEdit, name: e.target.value })
                      }
                      className="h-9 text-sm"
                      aria-label="goal name"
                      required
                    />
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        value={goalEdit.target}
                        onChange={(e) =>
                          setGoalEdit({ ...goalEdit, target: e.target.value })
                        }
                        placeholder="target ₹"
                        className="h-9 text-sm"
                        aria-label="target"
                        required
                      />
                      <Input
                        type="number"
                        value={goalEdit.startingAmount}
                        onChange={(e) =>
                          setGoalEdit({
                            ...goalEdit,
                            startingAmount: e.target.value,
                          })
                        }
                        placeholder="already had ₹"
                        className="h-9 text-sm"
                        aria-label="already had"
                      />
                    </div>
                    <Input
                      type="date"
                      value={goalEdit.deadline}
                      onChange={(e) =>
                        setGoalEdit({ ...goalEdit, deadline: e.target.value })
                      }
                      className="h-9 text-sm"
                      aria-label="deadline"
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button type="submit" size="sm" variant="primary">
                        <Check /> save
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => closeGoal(g, "done")}
                      >
                        <Target /> hit it
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="danger"
                        onClick={() => closeGoal(g, "delete")}
                      >
                        <Trash2 /> delete
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setGoalEdit(null)}
                      >
                        cancel
                      </Button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className="mb-1 flex items-center gap-2 text-sm">
                      <span className="flex-1 text-fg">{g.name}</span>
                      <button
                        type="button"
                        aria-label={`edit ${g.name}`}
                        onClick={() =>
                          setGoalEdit({
                            id: g._id,
                            name: g.name,
                            target: String(g.target),
                            startingAmount: String(g.startingAmount),
                            deadline: g.deadline ?? "",
                          })
                        }
                        className="text-faint opacity-60 transition hover:text-fg group-hover:opacity-100"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <span className="font-mono text-[12px] text-muted">
                        {Math.round(g.progress * 100)}%
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-panel-2">
                      <div
                        className="h-full rounded-full bg-grad"
                        style={{ width: `${Math.max(2, g.progress * 100)}%` }}
                      />
                    </div>
                    <p className="mt-1 text-[11.5px] text-faint">
                      {inr(g.saved)} of {inr(g.target)}
                      {g.deadline ? ` · by ${formatWhen(g.deadline)}` : ""}
                      {g.perMonthNeeded
                        ? ` · needs ${inr(g.perMonthNeeded)}/month`
                        : ""}
                    </p>
                    <div className="mt-2 flex gap-2">
                      <Input
                        type="number"
                        value={contrib[g._id] ?? ""}
                        onChange={(e) =>
                          setContrib((c) => ({ ...c, [g._id]: e.target.value }))
                        }
                        placeholder="add ₹"
                        className="h-8 text-xs"
                        aria-label={`add to ${g.name}`}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => addToGoal(g)}
                      >
                        <PiggyBank /> add
                      </Button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <div className="grid gap-5 md:grid-cols-2">
            <Bars title="where it came from" rows={s.bySource} tone="in" />
            <Bars title="where it went" rows={s.byCategory} tone="out" />
          </div>

          {expected.length > 0 && (
            <Card className="p-5">
              <p className="mb-2 flex items-center gap-1.5 font-mono text-[11px] text-faint">
                <Clock3 className="size-3" /> {"// expected, not here yet"}
              </p>
              <ul className="divide-y divide-line">
                {expected.map((e) => (
                  <li key={e._id} className="flex items-center gap-3 py-2">
                    <span className="flex-1 text-sm text-fg">
                      {e.title}{" "}
                      <span className="text-faint">· {formatWhen(e.date)}</span>
                    </span>
                    <span
                      className={cn(
                        "font-mono text-sm tabular-nums",
                        IN_KINDS.includes(e.kind) ? "text-ok" : "text-fg",
                      )}
                    >
                      {IN_KINDS.includes(e.kind) ? "+" : "-"}
                      {inr(e.amount)}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => markDone(e)}
                    >
                      <Check /> {IN_KINDS.includes(e.kind) ? "got it" : "paid"}
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {done.length === 0 ? (
            <EmptyState
              icon={<HandCoins />}
              title={`nothing logged for ${monthLabel(month)}`}
            >
              type it above like you&apos;d text me, or tell claude. payouts,
              spends, who owes you, all of it.
            </EmptyState>
          ) : (
            <Card className="p-2">
              {[...byDay].map(([day, rows]) => (
                <div key={day}>
                  <p className="px-3 pb-1 pt-3 font-mono text-[11px] text-faint">{`// ${formatWhen(day)}`}</p>
                  <ul>
                    {rows.map((e) => (
                      <li
                        key={e._id}
                        className="group flex items-center gap-3 rounded-2xl px-3 py-2 hover:bg-panel-2/60"
                      >
                        <span
                          className={cn(
                            "grid size-7 shrink-0 place-items-center rounded-full",
                            IN_KINDS.includes(e.kind)
                              ? "bg-ok/12 text-ok"
                              : e.kind === "saving"
                                ? "bg-info/12 text-info"
                                : "bg-panel-2 text-muted",
                          )}
                        >
                          {e.kind === "saving" ? (
                            <PiggyBank className="size-3.5" />
                          ) : IN_KINDS.includes(e.kind) ? (
                            <ArrowDownLeft className="size-3.5" />
                          ) : (
                            <ArrowUpRight className="size-3.5" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-fg">{e.title}</p>
                          <p className="text-[11px] text-faint">
                            {KIND_LABEL[e.kind]}
                            {e.category && e.kind === "expense"
                              ? ` · ${e.category}`
                              : ""}
                            {e.source ? ` · ${e.source}` : ""}
                            {e.counterparty ? ` · ${who(e.counterparty)}` : ""}
                            {e.account ? ` · ${e.account}` : ""}
                            {e.foreign
                              ? ` · ${e.foreign.amount} ${e.foreign.currency}`
                              : ""}
                            {e.via !== "app" ? ` · via ${e.via}` : ""}
                          </p>
                        </div>
                        <span
                          className={cn(
                            "font-mono text-sm tabular-nums",
                            IN_KINDS.includes(e.kind) ? "text-ok" : "text-fg",
                          )}
                        >
                          {IN_KINDS.includes(e.kind) ? "+" : "-"}
                          {inr(e.amount)}
                        </span>
                        <button
                          type="button"
                          onClick={() => remove(e)}
                          aria-label="delete"
                          className="text-faint opacity-0 transition hover:text-danger group-hover:opacity-100 max-md:opacity-100"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <Card className="p-5">
            <p className="mb-3 font-mono text-[11px] text-faint">
              {"// who owes who"}
            </p>
            {data.ious.length === 0 ? (
              <p className="text-sm text-faint">
                all square. log &quot;lent 5k to subham&quot; and it shows up
                here.
              </p>
            ) : (
              <ul className="space-y-2">
                {data.ious.map((d) => (
                  <li key={d.counterparty} className="flex items-center gap-2">
                    <span className="flex-1 text-sm text-fg">
                      {who(d.counterparty)}
                    </span>
                    <Badge tone={d.net > 0 ? "ok" : "warn"}>
                      {d.net > 0
                        ? `owes you ${inr(d.net)}`
                        : `you owe ${inr(-d.net)}`}
                    </Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => settle(d)}
                      aria-label="settle"
                    >
                      <Check />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
