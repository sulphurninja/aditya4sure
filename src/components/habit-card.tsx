"use client";

import { CigaretteOff, Dumbbell, Flame, Moon, Sparkles, Check, WineOff, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui";
import { api, cn } from "@/lib/utils";

type HabitView = { _id: string; name: string; emoji: string; good: string; bad: string; today: boolean | null; streak: number; best: number; last7: (boolean | null)[]; rate30: number };
type Board = { habits: HabitView[]; comeback: { day: number; total: number; left: number } };

const ICONS: Record<string, typeof Dumbbell> = { dumbbell: Dumbbell, ban: CigaretteOff, moon: Moon, sparkles: Sparkles, wine: WineOff };

export function HabitCard({ initial }: { initial: Board }) {
  const [board, setBoard] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const { comeback } = board;

  async function set(h: HabitView, done: boolean) {
    setBusy(h._id);
    try {
      // Tapping the same state again clears it.
      setBoard(await api<Board>("/api/habits", { method: "POST", json: { habitId: h._id, done: h.today === done ? null : done } }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(null);
    }
  }

  const doneToday = board.habits.filter((h) => h.today === true).length;

  return (
    <Card className="p-5">
      <div className="mb-1 flex items-baseline gap-2">
        <p className="flex-1 font-mono text-[11px] text-faint">{"// comeback"}</p>
        <span className="font-mono text-[11px] text-muted">
          day {comeback.day}/{comeback.total} · {comeback.left} left
        </span>
      </div>
      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-panel-2">
        <div className="h-full rounded-full bg-grad" style={{ width: `${Math.max(2, (comeback.day / comeback.total) * 100)}%` }} />
      </div>
      <ul className="space-y-3">
        {board.habits.map((h) => {
          const Icon = ICONS[h.emoji] ?? Sparkles;
          return (
            <li key={h._id} className="flex items-center gap-2.5">
              <Icon className={cn("size-4 shrink-0", h.today === true ? "text-accent" : "text-faint")} />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-fg">{h.name}</p>
                <div className="mt-1 flex items-center gap-1" aria-label="last 7 days">
                  {h.last7.map((v, i) => (
                    <span key={i} className={cn("size-1.5 rounded-full", v === true ? "bg-accent" : v === false ? "bg-danger/60" : "bg-panel-2")} />
                  ))}
                  {h.streak > 0 && (
                    <span className="ml-1.5 inline-flex items-center gap-0.5 font-mono text-[10.5px] text-accent">
                      <Flame className="size-3" /> {h.streak}
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                disabled={busy === h._id}
                onClick={() => set(h, true)}
                aria-label={`${h.name}: ${h.good}`}
                title={h.good}
                className={cn("grid size-8 place-items-center rounded-full border transition", h.today === true ? "border-transparent bg-grad text-accent-ink" : "border-line-strong text-faint hover:border-accent-line hover:text-accent")}
              >
                <Check className="size-4" />
              </button>
              <button
                type="button"
                disabled={busy === h._id}
                onClick={() => set(h, false)}
                aria-label={`${h.name}: ${h.bad}`}
                title={h.bad}
                className={cn("grid size-8 place-items-center rounded-full border transition", h.today === false ? "border-danger/40 bg-danger/15 text-danger" : "border-line-strong text-faint hover:border-danger/40 hover:text-danger")}
              >
                <X className="size-4" />
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-xs text-faint">
        {doneToday === board.habits.length ? "all done today. that's the comeback, keep stacking." : "or just tell me: \"gym done, no cigs, skipped skincare\". the 10 PM wrap-up asks too."}
      </p>
    </Card>
  );
}
