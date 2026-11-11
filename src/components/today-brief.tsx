"use client";

import { CalendarRange, Loader2, Moon, RefreshCw, Send, Sun, Wallet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button, Card, SquiggleTab } from "@/components/ui";
import { api } from "@/lib/utils";

type Kind = "morning" | "night" | "weekly" | "monthly";
type Entry = { kind: Kind; date: string; text: string; whatsapp: string; at: string };

const META: Record<Kind, { label: string; icon: typeof Sun; empty: string }> = {
  morning: { label: "morning brief", icon: Sun, empty: "lands on your whatsapp at 8 AM. or make one now." },
  night: { label: "night wrap-up", icon: Moon, empty: "comes at 10 PM: what got done, what you spent, what to remember." },
  weekly: { label: "week review", icon: CalendarRange, empty: "every sunday at 7 PM. done vs slipped, money, next week." },
  monthly: { label: "money report", icon: Wallet, empty: "on the 1st at 9 AM: last month's money, leaks, recurring, flat goal. as a voice note too." },
};

export function TodayBrief({ initial, defaultKind }: { initial: Partial<Record<Kind, Entry>>; defaultKind: Kind }) {
  const [entries, setEntries] = useState(initial);
  const [kind, setKind] = useState<Kind>(defaultKind);
  const [busy, setBusy] = useState<null | "make" | "send">(null);
  const e = entries[kind];

  async function run(send: boolean) {
    setBusy(send ? "send" : "make");
    try {
      const { entry } = await api<{ entry: Entry }>("/api/rhythm", { method: "POST", json: { kind, send } });
      setEntries((x) => ({ ...x, [kind]: entry }));
      if (send) toast[entry.whatsapp === "sent" ? "success" : "error"](entry.whatsapp === "sent" ? "sent to your whatsapp" : `whatsapp: ${entry.whatsapp}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="p-6">
      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        {(Object.keys(META) as Kind[]).map((k) => (
          <SquiggleTab key={k} active={kind === k} icon={META[k].icon} onClick={() => setKind(k)}>
            {META[k].label}
          </SquiggleTab>
        ))}
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => run(false)} disabled={Boolean(busy)}>
            {busy === "make" ? <Loader2 className="animate-spin" /> : <RefreshCw />} {e ? "redo" : "make it now"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => run(true)} disabled={Boolean(busy)}>
            {busy === "send" ? <Loader2 className="animate-spin" /> : <Send />} send to whatsapp
          </Button>
        </div>
      </div>
      {e ? (
        <>
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-fg">{e.text}</p>
          <p className="mt-3 font-mono text-[10.5px] text-faint">
            {new Date(e.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} · whatsapp {e.whatsapp}
          </p>
        </>
      ) : (
        <p className="text-sm text-faint">{META[kind].empty}</p>
      )}
    </Card>
  );
}
