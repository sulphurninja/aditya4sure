"use client";

import { Brain, Loader2, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Button, Card } from "@/components/ui";
import { api } from "@/lib/utils";

type Pending = { proposals: number; memories: number };
type Result = { conversations: number; messages: number; proposed: number; skipped: number; commitments: string[] };

export function LearnCard({ initial }: { initial: Pending }) {
  const [pending, setPending] = useState(initial);
  const [busy, setBusy] = useState(false);
  const total = pending.proposals + pending.memories;

  async function learn() {
    setBusy(true);
    try {
      const { result, pending: p } = await api<{ result: Result; pending: Pending }>("/api/learn", { method: "POST" });
      setPending(p);
      if (!result.conversations) toast("nothing new to learn from today yet");
      else
        toast.success(
          `read ${result.messages} of your messages: ${result.proposed} new thing${result.proposed === 1 ? "" : "s"} to review${result.commitments.length ? `, ${result.commitments.length} promise${result.commitments.length === 1 ? "" : "s"} tracked` : ""}`,
        );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <p className="mb-2 flex items-center gap-1.5 font-mono text-[11px] text-faint">
        <Brain className="size-3" /> {"// learning"}
      </p>
      <p className="text-sm text-muted">
        every night at 11:30 I read what you said today and pull out what&apos;s worth keeping, plus any promises you made to people.
      </p>
      <div className="mt-3 flex items-center gap-2">
        {total > 0 ? (
          <Link href="/review" className="text-sm font-medium text-accent hover:underline">
            {total} waiting for your tap
          </Link>
        ) : (
          <span className="text-sm text-faint">nothing waiting</span>
        )}
        <Button size="sm" variant="ghost" className="ml-auto" onClick={learn} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Sparkles />} learn from today
        </Button>
      </div>
    </Card>
  );
}
