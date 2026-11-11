"use client";

import { Check, EyeOff, Loader2, Pencil, Pin, PinOff, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { SECTIONS, SECTION_LABEL, TEMPORAL, TEMPORAL_LABEL, type Memory, type Section, type Sensitivity, type Temporal } from "@/lib/domain";
import { Button, Input, Select, Textarea } from "@/components/ui";
import { api } from "@/lib/utils";

export function MemoryActions({ m }: { m: Memory }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [statement, setStatement] = useState(m.statement);
  const [section, setSection] = useState<Section>(m.section);
  const [temporal, setTemporal] = useState<Temporal>(m.temporal);
  const [sensitivity, setSensitivity] = useState<Sensitivity>(m.sensitivity);
  const [eventAt, setEventAt] = useState(m.eventAt?.slice(0, 10) ?? "");
  const [reason, setReason] = useState("");
  const inactive = m.status !== "active";

  async function act(action: string) {
    setBusy(action);
    try {
      await api(`/api/memories/${encodeURIComponent(m._id)}/action`, { method: "POST", json: { action } });
      toast.success(
        { approve: "locked in", reject: "rejected, won't use it again", pin: "pinned", unpin: "unpinned", redact: "redacted", restore: "back in review" }[action] ?? "Done",
      );
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  async function correct() {
    setBusy("correct");
    try {
      const res = await api<{ memory: Memory }>(`/api/memories/${encodeURIComponent(m._id)}`, {
        method: "PATCH",
        json: { statement, section, temporal, sensitivity, eventAt: eventAt || null, reason: reason || undefined },
      });
      toast.success("fixed. old version kept in history");
      router.push(`/vault/${encodeURIComponent(res.memory._id)}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  async function del() {
    const typed = prompt('this nukes the memory and all its older versions for good. type "delete" to confirm.');
    if (typed?.trim().toLowerCase() !== "delete") return;
    setBusy("delete");
    try {
      await api(`/api/memories/${encodeURIComponent(m._id)}`, { method: "DELETE", headers: { "x-confirm-delete": "yes" } });
      toast.success("gone for good");
      router.push("/vault");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
      setBusy(null);
    }
  }

  async function redact() {
    if (!confirm("redact this? the text gets wiped and I stop using it, only a tombstone stays.")) return;
    await act("redact");
  }

  const spin = (k: string) => (busy === k ? <Loader2 className="animate-spin" /> : null);

  if (editing) {
    return (
      <div className="space-y-3 rounded-2xl border border-accent/30 bg-accent-soft/40 p-4">
        <p className="text-xs text-muted">fixing this makes a new version. the old one stays in history, nothing gets silently overwritten.</p>
        <Textarea rows={4} value={statement} onChange={(e) => setStatement(e.target.value)} />
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Select value={section} onChange={(e) => setSection(e.target.value as Section)}>
            {SECTIONS.map((s) => (
              <option key={s} value={s}>
                {SECTION_LABEL[s]}
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
          <Input type="date" value={eventAt} onChange={(e) => setEventAt(e.target.value)} />
        </div>
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="why the change? (optional)" />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={correct} disabled={busy !== null || statement.trim().length < 3}>
            {spin("correct")} save fix
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {m.reviewStatus !== "accepted" && !inactive && (
        <Button variant="primary" onClick={() => act("approve")} disabled={busy !== null}>
          {spin("approve") ?? <Check />} yep, true
        </Button>
      )}
      {!inactive && (
        <Button onClick={() => setEditing(true)} disabled={busy !== null}>
          <Pencil /> fix it
        </Button>
      )}
      {m.reviewStatus !== "rejected" && !inactive && (
        <Button variant="ghost" onClick={() => act("reject")} disabled={busy !== null}>
          {spin("reject") ?? <X />} not true
        </Button>
      )}
      {m.reviewStatus === "rejected" && (
        <Button variant="ghost" onClick={() => act("restore")} disabled={busy !== null}>
          back to review
        </Button>
      )}
      {!inactive && (
        <Button variant="ghost" onClick={() => act(m.pinned ? "unpin" : "pin")} disabled={busy !== null}>
          {m.pinned ? <PinOff /> : <Pin />} {m.pinned ? "unpin" : "pin"}
        </Button>
      )}
      {m.status !== "redacted" && (
        <Button variant="ghost" onClick={redact} disabled={busy !== null}>
          <EyeOff /> redact
        </Button>
      )}
      <Button variant="danger" onClick={del} disabled={busy !== null}>
        {spin("delete") ?? <Trash2 />} delete
      </Button>
    </div>
  );
}
