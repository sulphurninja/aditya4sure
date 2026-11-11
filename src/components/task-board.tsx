"use client";

import { Bell, BellOff, Bot, Check, CircleDashed, Clock3, Loader2, MoreHorizontal, Plus, Trash2, Undo2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { TASK_AREAS, TASK_KINDS, type Task, type TaskArea, type TaskKind } from "@/lib/domain";
import { Badge, Button, Card, EmptyState, Input, MenuItem, MenuSheet, Select, SquiggleTab } from "@/components/ui";
import { api, cn, formatWhen } from "@/lib/utils";

type View = "now" | "open" | "done";

const KIND_LABEL: Record<TaskKind, string> = { todo: "todo", commitment: "promised", followup: "chase", reminder: "reminder" };

function istToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function addDays(day: string, n: number) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** "15:00" -> "3 PM". */
function clock(at: string) {
  const [h, m] = at.split(":").map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
}

function bucket(t: Task, today: string): string {
  if (!t.due) return "someday";
  const d = t.due.slice(0, 10);
  if (d < today) return "overdue";
  if (d === today) return "today";
  if (d <= addDays(today, 7)) return "this week";
  return "later";
}

const ORDER = ["overdue", "today", "this week", "later", "someday"];

function dueLabel(due: string, today: string) {
  const d = due.slice(0, 10);
  if (d === today) return "today";
  if (d === addDays(today, 1)) return "tomorrow";
  if (d === addDays(today, -1)) return "yesterday";
  return formatWhen(d);
}

function TaskRow({ t, names, today, onChange, onRemove }: { t: Task; names: Record<string, string>; today: string; onChange: (t: Task) => void; onRemove: (id: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(false);
  const [open, setOpen] = useState(false);
  const done = t.status === "done";
  const overdue = !done && t.due && t.due.slice(0, 10) < today;

  async function patch(json: Partial<Task>, msg?: string) {
    setBusy(true);
    try {
      const { task } = await api<{ task: Task }>(`/api/tasks/${t._id}`, { method: "PATCH", json });
      onChange(task);
      if (msg) toast.success(msg);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
      setMenu(false);
    }
  }

  async function remove() {
    setMenu(false);
    if (!confirm(`delete "${t.title}" for good?`)) return;
    try {
      await api(`/api/tasks/${t._id}`, { method: "DELETE", headers: { "x-confirm-delete": "yes" } });
      onRemove(t._id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed");
    }
  }

  return (
    <li className="group relative flex items-start gap-3 rounded-2xl px-3 py-2.5 transition hover:bg-panel-2/60">
      <button
        type="button"
        aria-label={done ? "mark open" : "mark done"}
        disabled={busy}
        onClick={() => patch({ status: done ? "open" : "done" }, done ? undefined : "ticked off")}
        className={cn(
          "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2 transition",
          done ? "border-accent bg-accent text-accent-ink" : t.priority === 1 ? "border-danger/70 hover:bg-danger/10" : "border-line-strong hover:border-accent",
        )}
      >
        {busy ? <Loader2 className="size-3 animate-spin" /> : done ? <Check className="size-3" strokeWidth={3} /> : null}
      </button>
      <div className="min-w-0 flex-1">
        <button type="button" onClick={() => setOpen((o) => !o)} className={cn("text-left text-[14.5px] leading-snug", done ? "text-faint line-through" : "text-fg")}>
          {t.title}
        </button>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {t.kind !== "todo" && <Badge tone={t.kind === "commitment" ? "warn" : "info"}>{KIND_LABEL[t.kind]}</Badge>}
          <Badge>{t.area}</Badge>
          {t.due && <Badge tone={overdue ? "danger" : "neutral"}>{dueLabel(t.due, today)}</Badge>}
          {t.at && (
            <Badge tone="info">
              <Clock3 className="size-2.5" /> {clock(t.at)}
            </Badge>
          )}
          {t.remindAt && !done && (
            <span
              className={cn("inline-flex items-center gap-1 font-mono text-[10.5px]", t.remindedAt ? "text-faint" : "text-accent")}
              title={t.reminderLog ? `whatsapp: ${t.reminderLog.whatsapp}, voice note: ${t.reminderLog.voice}` : "reminder scheduled"}
            >
              {t.remindedAt ? <BellOff className="size-3" /> : <Bell className="size-3" />}
              {t.remindedAt ? (t.reminderLog?.whatsapp === "sent" ? "pinged on whatsapp" : "pinged") : `pings ${new Date(t.remindAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" })}`}
            </span>
          )}
          {t.entityIds.map((e) => (
            <Badge key={e} tone="accent">
              {names[e] ?? e.split(":")[1]}
            </Badge>
          ))}
          {t.source !== "app" && (
            <span className="inline-flex items-center gap-1 font-mono text-[10.5px] text-faint" title={t.source}>
              <Bot className="size-3" /> {t.source.startsWith("claude") ? "claude" : t.source.split(":")[0]}
            </span>
          )}
        </div>
        {open && t.notes && <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{t.notes}</p>}
        {open && t.source !== "app" && t.source !== "claude" && <p className="mt-1 font-mono text-[11px] text-faint">from {t.source}</p>}
      </div>
      <div className="relative">
        <button type="button" aria-label="more" onClick={() => setMenu((m) => !m)} className="grid size-7 place-items-center rounded-full text-faint opacity-0 transition hover:bg-panel-2 hover:text-fg group-hover:opacity-100 max-md:opacity-100">
          <MoreHorizontal className="size-4" />
        </button>
        {menu && (
          <MenuSheet className="absolute right-0 top-8 w-48" onMouseLeave={() => setMenu(false)}>
            {!done && <MenuItem icon={CircleDashed} onClick={() => patch({ due: today })}>do it today</MenuItem>}
            {!done && <MenuItem icon={CircleDashed} onClick={() => patch({ due: addDays(today, 1) })}>push to tomorrow</MenuItem>}
            {t.status === "open" ? (
              <MenuItem icon={X} onClick={() => patch({ status: "dropped" }, "dropped")}>drop it</MenuItem>
            ) : (
              <MenuItem icon={Undo2} onClick={() => patch({ status: "open" })}>reopen</MenuItem>
            )}
            <MenuItem icon={Trash2} danger onClick={remove}>delete</MenuItem>
          </MenuSheet>
        )}
      </div>
    </li>
  );
}

export function TaskBoard({ initial, names }: { initial: Task[]; names: Record<string, string> }) {
  const [tasks, setTasks] = useState(initial);
  const [view, setView] = useState<View>("now");
  const [area, setArea] = useState<TaskArea | "all">("all");
  const [title, setTitle] = useState("");
  const [newArea, setNewArea] = useState<TaskArea>("work");
  const [kind, setKind] = useState<TaskKind>("todo");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);
  const today = istToday();

  const upsert = (t: Task) => setTasks((all) => [t, ...all.filter((x) => x._id !== t._id)]);
  const drop = (id: string) => setTasks((all) => all.filter((x) => x._id !== id));

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (title.trim().length < 2) return;
    setBusy(true);
    try {
      const { task } = await api<{ task: Task }>("/api/tasks", { method: "POST", json: { title: title.trim(), area: newArea, kind, due: due || null } });
      upsert(task);
      setTitle("");
      setDue("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  const shown = useMemo(() => {
    const byArea = tasks.filter((t) => area === "all" || t.area === area);
    if (view === "done") return byArea.filter((t) => t.status !== "open").sort((a, b) => (b.doneAt ?? b.updatedAt).localeCompare(a.doneAt ?? a.updatedAt));
    const open = byArea.filter((t) => t.status === "open");
    return view === "now" ? open.filter((t) => ["overdue", "today", "this week"].includes(bucket(t, today)) || t.priority === 1) : open;
  }, [tasks, view, area, today]);

  const groups = useMemo(() => {
    if (view === "done") return [["done & dropped", shown] as const];
    const map = new Map<string, Task[]>();
    for (const t of shown) map.set(bucket(t, today), [...(map.get(bucket(t, today)) ?? []), t]);
    for (const list of map.values()) list.sort((a, b) => (a.due ?? "9").localeCompare(b.due ?? "9") || (a.at ?? "99").localeCompare(b.at ?? "99") || a.priority - b.priority);
    return ORDER.filter((k) => map.has(k)).map((k) => [k, map.get(k)!] as const);
  }, [shown, view, today]);

  const openCount = tasks.filter((t) => t.status === "open").length;
  const overdueCount = tasks.filter((t) => t.status === "open" && bucket(t, today) === "overdue").length;

  return (
    <div className="space-y-6">
      <Card className="p-3 transition focus-within:border-accent-line focus-within:shadow-[0_0_0_3px_var(--accent-soft)]">
        <form onSubmit={add} className="flex flex-col gap-2 md:flex-row md:items-center">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="what's on your plate? (or just tell claude)" className="border-transparent bg-transparent text-[15px] hover:border-transparent focus:border-transparent focus:ring-0 md:flex-1" maxLength={300} />
          <div className="flex flex-wrap items-center gap-2">
            <Select value={kind} onChange={(e) => setKind(e.target.value as TaskKind)} aria-label="kind" className="h-9 text-xs">
              {TASK_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </Select>
            <Select value={newArea} onChange={(e) => setNewArea(e.target.value as TaskArea)} aria-label="area" className="h-9 text-xs">
              {TASK_AREAS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </Select>
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="due" className="h-9 w-auto text-xs" />
            <Button type="submit" variant="primary" size="sm" disabled={busy || title.trim().length < 2}>
              {busy ? <Loader2 className="animate-spin" /> : <Plus />} add
            </Button>
          </div>
        </form>
      </Card>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <SquiggleTab active={view === "now"} onClick={() => setView("now")}>
          now{overdueCount ? <span className="ml-1.5 font-mono text-[11px] text-danger">{overdueCount} late</span> : null}
        </SquiggleTab>
        <SquiggleTab active={view === "open"} onClick={() => setView("open")}>
          everything open <span className="ml-1 font-mono text-[11px] text-faint">{openCount}</span>
        </SquiggleTab>
        <SquiggleTab active={view === "done"} onClick={() => setView("done")}>
          done
        </SquiggleTab>
        <Select value={area} onChange={(e) => setArea(e.target.value as TaskArea | "all")} aria-label="filter area" className="ml-auto h-8 text-xs">
          <option value="all">all areas</option>
          {TASK_AREAS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </Select>
      </div>

      {groups.length === 0 ? (
        <EmptyState icon={<Check />} title={view === "done" ? "nothing ticked off yet" : "plate's clean"}>
          {view === "now" ? "nothing due this week. either you're on top of it or you haven't told me yet." : "add one above, or ask claude to pull promises out of your mail."}
        </EmptyState>
      ) : (
        groups.map(([label, list]) => (
          <section key={label}>
            <p className={cn("mb-2 px-3 font-mono text-[11.5px]", label === "overdue" ? "text-danger" : "text-faint")}>{`// ${label}`}</p>
            <Card className="p-1.5">
              <ul>
                {list.map((t) => (
                  <TaskRow key={t._id} t={t} names={names} today={today} onChange={upsert} onRemove={drop} />
                ))}
              </ul>
            </Card>
          </section>
        ))
      )}
    </div>
  );
}
