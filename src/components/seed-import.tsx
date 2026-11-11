"use client";

import { CheckCircle2, Database, Eye, Loader2, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { SECTION_LABEL, type Section } from "@/lib/domain";
import { Badge, Button, Card, Select } from "@/components/ui";
import { api, cn } from "@/lib/utils";

type Row = { seedId: string; id: string; action: string; reason: string; statement: string; section: Section; sensitivity: string; status: string; notes: string[] };
type Plan = { checksum: string; rows: Row[]; counts: Record<string, number>; issues: { id: string; message: string }[]; entities: number; edges: number };

const ACTION_TONE: Record<string, "ok" | "info" | "neutral" | "accent" | "warn"> = {
  insert: "ok",
  update: "info",
  unchanged: "neutral",
  preserved: "accent",
  excluded: "warn",
};

export function SeedImport() {
  const router = useRouter();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState<"preview" | "import" | null>(null);
  const [excludeSensitive, setExcludeSensitive] = useState(false);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [done, setDone] = useState<Plan | null>(null);

  async function preview(nextExcluded = excluded, nextSens = excludeSensitive) {
    setBusy("preview");
    try {
      const res = await api<{ plan: Plan }>("/api/seed", { method: "POST", json: { dryRun: true, excludeSensitive: nextSens, excludeIds: [...nextExcluded] } });
      setPlan(res.plan);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setBusy(null);
    }
  }

  async function run() {
    setBusy("import");
    try {
      const res = await api<{ plan: Plan }>("/api/seed", { method: "POST", json: { dryRun: false, excludeSensitive, excludeIds: [...excluded] } });
      setDone(res.plan);
      setPlan(null);
      toast.success(`Imported: ${res.plan.counts.insert} new, ${res.plan.counts.update} updated, ${res.plan.counts.preserved} preserved`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(null);
    }
  }

  const rows = useMemo(() => (plan?.rows ?? []).filter((r) => !filter || r.action === filter), [plan, filter]);

  const toggle = (seedId: string) => {
    const next = new Set(excluded);
    if (next.has(seedId)) next.delete(seedId);
    else next.add(seedId);
    setExcluded(next);
    void preview(next);
  };

  return (
    <Card className="p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-line-strong bg-elev">
            <Database className="size-5 text-accent" />
          </span>
          <div>
            <h2 className="text-lg font-medium">the ChatGPT seed</h2>
            <p className="mt-1 max-w-xl text-sm text-muted">
              <span className="font-mono text-xs">aditya-knowledge.json</span>: 92 facts ChatGPT summarized about you. Imported as <em>unverified</em> with discounted confidence, so you confirm what&apos;s true. Re-running never duplicates facts or overwrites anything you&apos;ve reviewed or edited.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button onClick={() => preview()} disabled={busy !== null}>
            {busy === "preview" ? <Loader2 className="animate-spin" /> : <Eye />} dry run
          </Button>
          <Button variant="primary" onClick={run} disabled={busy !== null || !plan}>
            {busy === "import" ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} import
          </Button>
        </div>
      </div>

      {done && !plan && (
        <div className="mt-5 rounded-xl border border-ok/30 bg-ok/10 p-4 text-sm text-ok">
          Done. {done.counts.insert} inserted · {done.counts.update} updated · {done.counts.unchanged} unchanged · {done.counts.preserved} preserved · {done.counts.excluded} excluded. {done.entities} people/projects and {done.edges} relationships synced.
        </div>
      )}

      {plan && (
        <div className="mt-6 animate-rise">
          <div className="flex flex-wrap items-center gap-2">
            {Object.entries(plan.counts).map(([k, v]) => (
              <button key={k} onClick={() => setFilter(filter === k ? "" : k)} className={cn("rounded-lg border px-3 py-1.5 text-xs transition", filter === k ? "border-accent/50 text-accent" : "border-line text-muted hover:text-fg")}>
                <span className="font-mono">{v}</span> {k}
              </button>
            ))}
            <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={excludeSensitive}
                onChange={(e) => {
                  setExcludeSensitive(e.target.checked);
                  void preview(excluded, e.target.checked);
                }}
                className="accent-[var(--accent)]"
              />
              <ShieldAlert className="size-3.5 text-sensitive" /> skip all sensitive stuff
            </label>
          </div>
          {plan.issues.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-warn">
              {plan.issues.map((i) => (
                <li key={i.id + i.message}>
                  {i.id}: {i.message}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 max-h-[520px] overflow-y-auto rounded-xl border border-line">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-panel-2 font-mono text-[10.5px] uppercase tracking-wider text-faint">
                <tr>
                  <th className="w-10 p-2.5" title="Include">✓</th>
                  <th className="p-2.5">Fact</th>
                  <th className="hidden p-2.5 md:table-cell">Area</th>
                  <th className="p-2.5">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.seedId} className="border-t border-line align-top">
                    <td className="p-2.5">
                      <input type="checkbox" checked={!excluded.has(r.seedId)} onChange={() => toggle(r.seedId)} disabled={r.action === "preserved" || r.action === "unchanged" || r.action === "update"} className="accent-[var(--accent)]" aria-label={`Include ${r.seedId}`} />
                    </td>
                    <td className="p-2.5">
                      <p className={cn("text-muted", r.sensitivity === "sensitive" && "text-fg/80")}>
                        <span className="mr-2 font-mono text-[10.5px] text-faint">{r.seedId}</span>
                        {r.statement}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {r.sensitivity === "sensitive" && <Badge tone="sensitive">sensitive</Badge>}
                        {r.status === "merged" && <Badge tone="warn">merged duplicate</Badge>}
                        {r.notes
                          .filter((n) => !n.startsWith("From an assistant"))
                          .map((n) => (
                            <span key={n} className="text-[11px] text-warn">
                              {n}
                            </span>
                          ))}
                      </div>
                    </td>
                    <td className="hidden p-2.5 text-xs text-faint md:table-cell">{SECTION_LABEL[r.section] ?? r.section}</td>
                    <td className="p-2.5">
                      <Badge tone={ACTION_TONE[r.action]} title={r.reason}>
                        {r.action}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-faint">
            <span>Show:</span>
            <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="h-7 text-xs">
              <option value="">all</option>
              {Object.keys(plan.counts).map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </Select>
            <span className="ml-auto font-mono">checksum {plan.checksum.slice(0, 12)}</span>
          </div>
        </div>
      )}
    </Card>
  );
}
