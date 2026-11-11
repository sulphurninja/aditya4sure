"use client";

import { Eye, Pin, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { SECTION_LABEL, TEMPORAL_LABEL, type Memory } from "@/lib/domain";
import { Badge } from "@/components/ui";
import { cn, formatWhen } from "@/lib/utils";
import { useSensitiveVisible } from "./sensitive";

export function ReviewBadge({ m }: { m: Pick<Memory, "reviewStatus" | "isInferred"> }) {
  if (m.reviewStatus === "accepted") return <Badge tone="ok">confirmed</Badge>;
  if (m.reviewStatus === "rejected") return <Badge tone="danger">rejected</Badge>;
  return <Badge tone="warn">{m.isInferred ? "inferred" : "unverified"}</Badge>;
}

export function TemporalBadge({ m }: { m: Pick<Memory, "temporal"> }) {
  const tone = m.temporal === "snapshot" ? "info" : m.temporal === "plan" || m.temporal === "goal" ? "accent" : "neutral";
  return <Badge tone={tone}>{TEMPORAL_LABEL[m.temporal]}</Badge>;
}

export function MemoryCard({ m, compact = false, showSection = true }: { m: Memory; compact?: boolean; showSection?: boolean }) {
  const { visible } = useSensitiveVisible();
  const [peek, setPeek] = useState(false);
  const hidden = m.sensitivity === "sensitive" && !visible && !peek;
  const when = m.eventAt ?? m.observedAt;

  return (
    <article
      className={cn(
        "glass group relative rounded-2xl transition-all hover:-translate-y-0.5 hover:border-line-strong",
        compact ? "p-3.5" : "p-4",
        m.status === "redacted" && "opacity-60",
      )}
    >
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {m.pinned && <Pin className="size-3 text-accent" />}
        {showSection && <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-faint">{SECTION_LABEL[m.section]}</span>}
        <span className="text-faint">·</span>
        <span className="font-mono text-[10.5px] text-faint">{formatWhen(when)}</span>
        <span className="ml-auto flex flex-wrap gap-1">
          <TemporalBadge m={m} />
          <ReviewBadge m={m} />
          {m.sensitivity === "sensitive" && <Badge tone="sensitive">sensitive</Badge>}
          {m.provenance.origin === "chat_extraction" && (
            <Badge tone="accent">
              <Sparkles className="size-2.5" /> learned
            </Badge>
          )}
        </span>
      </div>
      <Link href={`/vault/${encodeURIComponent(m._id)}`} className="block focus-visible:outline-none">
        <p className={cn("text-[14.5px] leading-relaxed text-fg transition", hidden && "select-none blur-[6px]")}>{m.statement}</p>
      </Link>
      {hidden && (
        <button onClick={() => setPeek(true)} className="absolute inset-x-0 bottom-3 mx-auto flex w-fit items-center gap-1.5 rounded-full border border-line-strong bg-panel-2 px-3 py-1 text-xs text-muted hover:text-fg">
          <Eye className="size-3.5" /> reveal
        </button>
      )}
      {!compact && m.reviewNotes.length > 0 && !hidden && (
        <p className="mt-2 text-xs text-faint">{m.reviewNotes[0]}</p>
      )}
    </article>
  );
}
