"use client";

import { CakeSlice, Gift, Heart, Loader2, Plus, RefreshCw, Sparkles, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Badge, Button, Card, Input, Select } from "@/components/ui";
import { api } from "@/lib/utils";

export type DateRow = { _id: string; personName: string; kind: "birthday" | "anniversary" | "other"; label: string; monthDay: string; next: string; inDays: number; confidence: number; source: "brain" | "manual" };
export type Gift = { idea: string; quote: string; date: string | null; price: string | null };

const KIND_ICON = { birthday: CakeSlice, anniversary: Heart, other: Sparkles } as const;

function when(d: { next: string; inDays: number }) {
  const label = new Date(`${d.next}T12:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }).toLowerCase();
  return d.inDays === 0 ? "today" : d.inDays === 1 ? "tomorrow" : d.inDays < 30 ? `${label} · in ${d.inDays}d` : label;
}

/** Birthdays / anniversaries: brain-found + yours, with refresh and add-by-hand. */
export function DatesCard({ initial, personName }: { initial: DateRow[]; personName?: string }) {
  const [dates, setDates] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<{ personName: string; kind: DateRow["kind"]; label: string; date: string } | null>(null);

  async function refresh() {
    setBusy(true);
    try {
      const r = await api<{ dates: DateRow[]; found: number }>("/api/people/dates", { method: "POST", json: { refresh: true } });
      setDates(personName ? r.dates.filter((d) => d.personName.toLowerCase().includes(personName.toLowerCase())) : r.dates);
      toast.success(`found ${r.found} date${r.found === 1 ? "" : "s"} in your brain`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    try {
      const r = await api<{ dates: DateRow[] }>("/api/people/dates", { method: "POST", json: form });
      setDates(personName ? r.dates.filter((d) => d.personName.toLowerCase().includes(personName.toLowerCase())) : r.dates);
      setForm(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed");
    }
  }

  async function remove(id: string) {
    const r = await api<{ dates: DateRow[] }>(`/api/people/dates?id=${id}`, { method: "DELETE" });
    setDates(personName ? r.dates.filter((d) => d.personName.toLowerCase().includes(personName.toLowerCase())) : r.dates);
  }

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center gap-2">
        <p className="flex-1 font-mono text-[11px] text-faint">{"// dates that matter"}</p>
        <Button size="sm" variant="ghost" onClick={() => setForm(form ? null : { personName: personName ?? "", kind: "birthday", label: "", date: "" })}>
          <Plus /> add
        </Button>
        <Button size="sm" variant="ghost" onClick={refresh} disabled={busy} aria-label="find dates in my brain">
          {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />}
        </Button>
      </div>
      {form && (
        <form onSubmit={save} className="mb-3 space-y-2 rounded-2xl border border-line-strong p-3">
          <div className="flex gap-2">
            <Input value={form.personName} onChange={(e) => setForm({ ...form, personName: e.target.value })} placeholder="whose" className="h-9 text-sm" required />
            <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as DateRow["kind"] })} className="h-9 text-sm" aria-label="kind">
              <option value="birthday">birthday</option>
              <option value="anniversary">anniversary</option>
              <option value="other">other</option>
            </Select>
          </div>
          <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="what, e.g. Komal's birthday" className="h-9 text-sm" required />
          <div className="flex gap-2">
            <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="h-9 flex-1 text-sm" required aria-label="date" />
            <Button type="submit" size="sm" variant="primary">
              save
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setForm(null)} aria-label="cancel">
              <X />
            </Button>
          </div>
        </form>
      )}
      {dates.length === 0 ? (
        <p className="text-sm text-faint">none yet. hit refresh and I&apos;ll look through everything I know, or add one.</p>
      ) : (
        <ul className="space-y-2">
          {dates.map((d) => {
            const Icon = KIND_ICON[d.kind];
            return (
              <li key={d._id} className="group flex items-center gap-2.5 text-sm">
                <Icon className={d.inDays <= 7 ? "size-4 shrink-0 text-accent" : "size-4 shrink-0 text-faint"} />
                <span className="min-w-0 flex-1 truncate text-fg">{d.label}</span>
                {d.confidence < 0.8 && d.source === "brain" && <Badge tone="warn">not sure</Badge>}
                <span className={d.inDays <= 7 ? "font-mono text-[11px] text-accent" : "font-mono text-[11px] text-faint"}>{when(d)}</span>
                <button type="button" onClick={() => remove(d._id)} aria-label={`remove ${d.label}`} className="text-faint opacity-0 transition hover:text-danger group-hover:opacity-100 max-md:opacity-100">
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/** Things they said they wanted, pulled from their side of the chats. */
export function GiftRadar({ entityId, name, initial, hasChats }: { entityId: string; name: string; initial: Gift[]; hasChats: boolean }) {
  const [ideas, setIdeas] = useState(initial);
  const [busy, setBusy] = useState(false);
  async function scan() {
    setBusy(true);
    try {
      const r = await api<{ ideas: Gift[]; scanned: number }>(`/api/people/${encodeURIComponent(entityId)}/gifts`, { method: "POST" });
      setIdeas(r.ideas);
      toast.success(r.scanned ? `read ${r.scanned} of their messages, ${r.ideas.length} ideas` : "nothing that sounded like a wish");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center gap-2">
        <p className="flex flex-1 items-center gap-1.5 font-mono text-[11px] text-faint">
          <Gift className="size-3" /> {"// gift radar"}
        </p>
        {hasChats && (
          <Button size="sm" variant="ghost" onClick={scan} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />} {ideas.length ? "rescan" : "scan chats"}
          </Button>
        )}
      </div>
      {!hasChats ? (
        <p className="text-sm text-faint">import your chats with {name} and I&apos;ll catch what they say they want.</p>
      ) : ideas.length === 0 ? (
        <p className="text-sm text-faint">scan your chats with {name} for things they said they wanted. only their messages, last 12 months.</p>
      ) : (
        <ul className="space-y-2.5">
          {ideas.map((g, i) => (
            <li key={i} className="text-sm">
              <p className="text-fg">
                {g.idea}
                {g.price ? <span className="text-faint"> · {g.price}</span> : null}
              </p>
              <p className="text-xs text-faint">
                &ldquo;{g.quote.slice(0, 120)}&rdquo;{g.date ? ` · ${g.date}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function PrepButton({ first }: { first: string }) {
  return (
    <Link href={`/?q=${encodeURIComponent(`prep me for my next chat with ${first}: what's open between us, what I promised, anything to bring up`)}`} className="inline-flex h-9 items-center gap-2 rounded-full bg-grad px-4 text-sm font-semibold text-accent-ink transition hover:brightness-110">
      <Sparkles className="size-4" /> prep me for {first}
    </Link>
  );
}
