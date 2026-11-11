"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { SECTION_LABEL, type Memory, type Section } from "@/lib/domain";
import { Badge, EmptyState, Select } from "@/components/ui";
import { cn, formatWhen } from "@/lib/utils";
import { useSensitiveVisible } from "./memory/sensitive";

export function Timeline({ memories, order = "desc", filterable = false, today }: { memories: Memory[]; order?: "asc" | "desc"; filterable?: boolean; today: string }) {
  const { visible } = useSensitiveVisible();
  const [section, setSection] = useState<Section | "">("");
  const sections = useMemo(() => [...new Set(memories.map((m) => m.section))], [memories]);

  const groups = useMemo(() => {
    const sorted = memories
      .filter((m) => m.eventAt && (!section || m.section === section))
      .sort((a, b) => (order === "asc" ? a.eventAt!.localeCompare(b.eventAt!) : b.eventAt!.localeCompare(a.eventAt!)));
    const out: { key: string; label: string; items: Memory[] }[] = [];
    for (const m of sorted) {
      const key = m.eventAt!.slice(0, 7);
      const last = out[out.length - 1];
      if (last?.key === key) last.items.push(m);
      else out.push({ key, label: formatWhen(key + "-01"), items: [m] });
    }
    return out;
  }, [memories, order, section]);

  if (!groups.length && !section) return <EmptyState title="nothing dated yet">events, plans and snapshots with dates land here.</EmptyState>;

  return (
    <div>
      {filterable && sections.length > 1 && (
        <div className="mb-6">
          <Select value={section} onChange={(e) => setSection(e.target.value as Section | "")}>
            <option value="">all areas</option>
            {sections.map((s) => (
              <option key={s} value={s}>
                {SECTION_LABEL[s]}
              </option>
            ))}
          </Select>
        </div>
      )}
      <ol className="relative ml-3 border-l border-line">
        {groups.map((g) => (
          <li key={g.key} className="mb-8 pl-6">
            <span className={cn("absolute -left-[5px] mt-1.5 size-2.5 rounded-full border-2 border-bg", g.key > today.slice(0, 7) ? "bg-accent-2" : "bg-accent")} />
            <p className="mb-3 font-display text-lg font-semibold tracking-tight text-muted">
              {g.label}
              {g.key > today.slice(0, 7) && <span className="ml-2 font-sans text-xs text-accent-2">upcoming</span>}
            </p>
            <ul className="space-y-2.5">
              {g.items.map((m) => {
                const hidden = m.sensitivity === "sensitive" && !visible;
                const future = m.eventAt! > today;
                return (
                  <li key={m._id}>
                    <Link href={`/vault/${encodeURIComponent(m._id)}`} className="group block rounded-xl border border-transparent p-2 -m-2 transition hover:border-line hover:bg-panel/60">
                      <div className="mb-1 flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-[10.5px] text-faint">{formatWhen(m.eventAt)}</span>
                        <Badge>{SECTION_LABEL[m.section]}</Badge>
                        {m.temporal === "snapshot" && <Badge tone="info">snapshot</Badge>}
                        {(m.temporal === "plan" || future) && <Badge tone="accent">{future ? "planned" : "plan"}</Badge>}
                        {m.temporal === "goal" && <Badge tone="accent">goal</Badge>}
                        {m.reviewStatus === "pending" && <Badge tone="warn">unverified</Badge>}
                      </div>
                      <p className={cn("text-sm leading-relaxed text-fg/85 group-hover:text-fg", hidden && "blur-[5px]")}>{m.statement}</p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}
