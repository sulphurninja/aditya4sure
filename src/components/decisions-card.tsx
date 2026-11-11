"use client";

import { Check, Compass, Gavel, RotateCcw, Target, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge, Card } from "@/components/ui";
import { api, cn, formatWhen } from "@/lib/utils";

type Decision = { _id: string; statement: string; decidedAt: string; followUp: string | null; status: "active" | "done" | "changed" | "dropped"; changeNote: string | null; drifts: { at: string; note: string }[] };

export function DecisionsCard({ initial, practice }: { initial: Decision[]; practice: { title: string; how: string } }) {
  const [list, setList] = useState(initial);
  const active = list.filter((d) => d.status === "active");
  const closed = list.filter((d) => d.status !== "active").slice(0, 3);

  async function set(d: Decision, status: Decision["status"]) {
    let note: string | null = null;
    if (status === "changed") {
      note = prompt("changing it is fine, once, with a real reason. what's the reason?");
      if (!note?.trim()) return;
    }
    try {
      const r = await api<{ decisions: Decision[] }>("/api/decisions", { method: "POST", json: { id: d._id, status, note } });
      setList(r.decisions);
      if (status === "done") toast.success("followed through. that's the man she's talking about");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed");
    }
  }

  return (
    <Card className="p-5">
      <p className="mb-2 flex items-center gap-1.5 font-mono text-[11px] text-faint">
        <Target className="size-3" /> {"// today's practice"}
      </p>
      <p className="text-sm font-medium text-fg">{practice.title}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted">{practice.how}</p>

      <p className="mb-2 mt-5 flex items-center gap-1.5 font-mono text-[11px] text-faint">
        <Gavel className="size-3" /> {"// decided"}
      </p>
      {active.length === 0 ? (
        <p className="text-sm text-faint">nothing locked yet. say &quot;decided: …&quot; anywhere (chat, voice, whatsapp) and I&apos;ll hold you to it.</p>
      ) : (
        <ul className="space-y-2.5">
          {active.map((d) => (
            <li key={d._id} className="flex items-start gap-2">
              <Compass className="mt-0.5 size-4 shrink-0 text-accent" />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-fg">{d.statement}</p>
                <p className="text-[11px] text-faint">
                  {formatWhen(d.decidedAt.slice(0, 10))}
                  {d.followUp ? ` · act by ${formatWhen(d.followUp)}` : ""}
                </p>
                {d.drifts.length > 0 && <Badge tone="warn" className="mt-1">wobbled {d.drifts.length}x</Badge>}
              </div>
              <button type="button" onClick={() => set(d, "done")} aria-label="done" title="did it" className="grid size-7 place-items-center rounded-full border border-line-strong text-faint transition hover:border-accent-line hover:text-accent">
                <Check className="size-3.5" />
              </button>
              <button type="button" onClick={() => set(d, "changed")} aria-label="change" title="change it (once, with a reason)" className="grid size-7 place-items-center rounded-full border border-line-strong text-faint transition hover:text-fg">
                <RotateCcw className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {closed.length > 0 && (
        <ul className="mt-3 space-y-1">
          {closed.map((d) => (
            <li key={d._id} className={cn("flex items-center gap-1.5 text-xs", d.status === "done" ? "text-ok" : "text-faint")}>
              {d.status === "done" ? <Check className="size-3" /> : <X className="size-3" />}
              <span className="truncate">{d.statement}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
