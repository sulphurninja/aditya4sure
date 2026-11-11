"use client";

import { Archive, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { SECTION_LABEL, TEMPORAL_LABEL, type Memory, type Section, type Temporal } from "@/lib/domain";
import { EmptyState, Input, Select } from "@/components/ui";
import { MemoryCard } from "./memory-card";

export function MemoryList({
  memories,
  showFilters = true,
  showSection = true,
  emptyTitle = "nothing here yet",
  emptyHint,
  columns = 1,
}: {
  memories: Memory[];
  showFilters?: boolean;
  showSection?: boolean;
  emptyTitle?: string;
  emptyHint?: React.ReactNode;
  columns?: 1 | 2;
}) {
  const [q, setQ] = useState("");
  const [section, setSection] = useState<Section | "">("");
  const [review, setReview] = useState<"" | "accepted" | "pending">("");
  const [temporal, setTemporal] = useState<Temporal | "">("");
  const [sens, setSens] = useState<"" | "sensitive" | "not">("");

  const sections = useMemo(() => [...new Set(memories.map((m) => m.section))], [memories]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return memories.filter(
      (m) =>
        (!needle || m.statement.toLowerCase().includes(needle) || m.tags.some((t) => t.includes(needle))) &&
        (!section || m.section === section) &&
        (!review || m.reviewStatus === review) &&
        (!temporal || m.temporal === temporal) &&
        (!sens || (sens === "sensitive" ? m.sensitivity === "sensitive" : m.sensitivity !== "sensitive")),
    );
  }, [memories, q, section, review, temporal, sens]);

  return (
    <div>
      {showFilters && memories.length > 0 && (
        <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="filter…" className="pl-9" />
          </div>
          <div className="flex flex-wrap gap-2">
            {sections.length > 1 && (
              <Select value={section} onChange={(e) => setSection(e.target.value as Section | "")}>
                <option value="">all areas</option>
                {sections.map((s) => (
                  <option key={s} value={s}>
                    {SECTION_LABEL[s]}
                  </option>
                ))}
              </Select>
            )}
            <Select value={review} onChange={(e) => setReview(e.target.value as typeof review)}>
              <option value="">any status</option>
              <option value="accepted">confirmed</option>
              <option value="pending">unverified</option>
            </Select>
            <Select value={temporal} onChange={(e) => setTemporal(e.target.value as Temporal | "")}>
              <option value="">any time</option>
              {(Object.keys(TEMPORAL_LABEL) as Temporal[]).map((t) => (
                <option key={t} value={t}>
                  {TEMPORAL_LABEL[t]}
                </option>
              ))}
            </Select>
            <Select value={sens} onChange={(e) => setSens(e.target.value as typeof sens)}>
              <option value="">any privacy</option>
              <option value="sensitive">sensitive only</option>
              <option value="not">non-sensitive</option>
            </Select>
          </div>
        </div>
      )}
      {filtered.length === 0 ? (
        <EmptyState icon={<Archive />} title={memories.length ? "nothing matches" : emptyTitle}>
          {memories.length ? "try another filter" : emptyHint}
        </EmptyState>
      ) : (
        <>
          <p className="mb-3 font-mono text-[11px] text-faint">
            {filtered.length} of {memories.length}
          </p>
          <div className={columns === 2 ? "grid gap-3 md:grid-cols-2" : "grid gap-3"}>
            {filtered.map((m, i) => (
              <div key={m._id} className="animate-rise" style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}>
                <MemoryCard m={m} showSection={showSection} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
