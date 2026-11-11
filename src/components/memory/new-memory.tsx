"use client";

import { Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { MEMORY_TYPES, SECTIONS, SECTION_LABEL, TEMPORAL, TEMPORAL_LABEL, type MemoryType, type Section, type Sensitivity, type Temporal } from "@/lib/domain";
import { Button, Input, Select, Textarea } from "@/components/ui";
import { api } from "@/lib/utils";

export function NewMemoryButton({ defaultSection = "identity" as Section }: { defaultSection?: Section }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statement, setStatement] = useState("");
  const [section, setSection] = useState<Section>(defaultSection);
  const [type, setType] = useState<MemoryType>("preference");
  const [temporal, setTemporal] = useState<Temporal>("stable");
  const [sensitivity, setSensitivity] = useState<Sensitivity>("private");
  const [eventAt, setEventAt] = useState("");

  async function save() {
    setBusy(true);
    try {
      await api("/api/memories", {
        method: "POST",
        json: { statement, section, type, temporal, sensitivity, eventAt: eventAt || null },
      });
      toast.success("got it, remembered");
      setOpen(false);
      setStatement("");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (!open)
    return (
      <Button variant="primary" onClick={() => setOpen(true)}>
        <Plus /> remember something
      </Button>
    );

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setOpen(false)}>
      <div className="sheet relative w-full max-w-lg p-6 animate-pop" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="font-mono text-[11px] text-faint">{"// new memory"}</p>
            <h2 className="font-display text-2xl font-bold tracking-tight">remember something</h2>
          </div>
          <button onClick={() => setOpen(false)} className="text-faint hover:text-fg" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <Textarea rows={4} autoFocus value={statement} onChange={(e) => setStatement(e.target.value)} placeholder="e.g. I prefer async updates over calls for Zaptick eng syncs" />
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Select value={section} onChange={(e) => setSection(e.target.value as Section)}>
            {SECTIONS.map((s) => (
              <option key={s} value={s}>
                {SECTION_LABEL[s]}
              </option>
            ))}
          </Select>
          <Select value={type} onChange={(e) => setType(e.target.value as MemoryType)}>
            {MEMORY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace("_", " ")}
              </option>
            ))}
          </Select>
          <Select value={temporal} onChange={(e) => setTemporal(e.target.value as Temporal)}>
            {TEMPORAL.map((t) => (
              <option key={t} value={t}>
                {TEMPORAL_LABEL[t]}
              </option>
            ))}
          </Select>
          <Select value={sensitivity} onChange={(e) => setSensitivity(e.target.value as Sensitivity)}>
            <option value="normal">Normal</option>
            <option value="private">Private</option>
            <option value="sensitive">Sensitive</option>
          </Select>
          <label className="col-span-2 flex items-center gap-2 text-xs text-muted">
            when (optional)
            <Input type="date" value={eventAt} onChange={(e) => setEventAt(e.target.value)} className="flex-1" />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={busy || statement.trim().length < 3}>
            save it
          </Button>
        </div>
      </div>
    </div>
  );
}
