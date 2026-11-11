"use client";

import { AlertTriangle, Check, CheckCheck, Loader2, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { SECTION_LABEL, type Memory, type Proposal } from "@/lib/domain";
import { Badge, Button, Card, EmptyState, Textarea } from "@/components/ui";
import { api, cn, formatWhen } from "@/lib/utils";
import { useSensitiveVisible } from "./memory/sensitive";

function ProposalCard({ p, onDone }: { p: Proposal; onDone: (id: string) => void }) {
  const [text, setText] = useState(p.candidate.statement);
  const [busy, setBusy] = useState(false);
  async function decide(decision: "approve" | "reject") {
    setBusy(true);
    try {
      await api(`/api/proposals/${p._id}`, { method: "POST", json: { decision, statement: text !== p.candidate.statement ? text : undefined } });
      toast.success(decision === "approve" ? "remembered" : "tossed");
      onDone(p._id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
      setBusy(false);
    }
  }
  return (
    <Card className="p-4">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <Badge tone="accent">
          <Sparkles className="size-2.5" /> {p.sourceConversationId === "claude" ? "claude spotted this" : "learned from chat"}
        </Badge>
        <Badge>{SECTION_LABEL[p.candidate.section]}</Badge>
        <Badge>{p.candidate.temporal}</Badge>
        {p.candidate.eventAt && <Badge tone="info">{formatWhen(p.candidate.eventAt)}</Badge>}
        {p.candidate.isInferred && <Badge tone="warn">inferred</Badge>}
        {p.candidate.sensitivity === "sensitive" && <Badge tone="sensitive">sensitive</Badge>}
        <span className="ml-auto font-mono text-[10.5px] text-faint">{Math.round(p.candidate.confidence * 100)}%</span>
      </div>
      <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} className="bg-transparent text-[14.5px]" />
      <blockquote className="mt-2 border-l-2 border-accent/40 pl-3 text-xs text-muted">{p.sourceConversationId === "claude" ? "from" : "you said"}: “{p.candidate.evidenceQuote}”</blockquote>
      <p className="mt-1.5 text-xs text-faint">{p.candidate.reason}</p>
      {(p.duplicateOf || p.conflictsWith.length > 0) && (
        <div className="mt-3 rounded-lg border border-warn/25 bg-warn/5 p-3 text-xs">
          <p className="mb-1 flex items-center gap-1.5 font-medium text-warn">
            <AlertTriangle className="size-3.5" /> {p.duplicateOf ? "might be a duplicate" : "double check against these"}
          </p>
          <ul className="space-y-1 text-muted">
            {p.conflictsWith.slice(0, 3).map((c) => (
              <li key={c.id}>
                <Link href={`/vault/${encodeURIComponent(c.id)}`} className="hover:text-fg">
                  • {c.statement}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-faint">If this replaces an old fact, approve this and hit Correct on the old one, or just edit the old one.</p>
        </div>
      )}
      <div className="mt-3 flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => decide("reject")} disabled={busy}>
          <X /> nah
        </Button>
        <Button size="sm" variant="primary" onClick={() => decide("approve")} disabled={busy || text.trim().length < 3}>
          {busy ? <Loader2 className="animate-spin" /> : <Check />} remember
        </Button>
      </div>
    </Card>
  );
}

function PendingRow({ m, onDone }: { m: Memory; onDone: (id: string) => void }) {
  const { visible } = useSensitiveVisible();
  const [busy, setBusy] = useState(false);
  const blurred = m.sensitivity === "sensitive" && !visible;
  async function act(action: "approve" | "reject") {
    setBusy(true);
    try {
      await api(`/api/memories/${encodeURIComponent(m._id)}/action`, { method: "POST", json: { action } });
      onDone(m._id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
      setBusy(false);
    }
  }
  return (
    <li className="group flex items-start gap-3 border-b border-line py-3 last:border-0">
      <div className="min-w-0 flex-1">
        <Link href={`/vault/${encodeURIComponent(m._id)}`} className={cn("text-[14px] leading-relaxed text-fg/90 hover:text-fg", blurred && "blur-[5px] hover:blur-none transition")}>
          {m.statement}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 font-mono text-[10.5px] text-faint">
          <span>{m.provenance.seedId ?? m._id}</span>·<span>{formatWhen(m.eventAt ?? m.observedAt)}</span>
          {m.sensitivity === "sensitive" && <Badge tone="sensitive">sensitive</Badge>}
          {m.reviewNotes
            .filter((n) => !n.startsWith("From an assistant"))
            .slice(0, 2)
            .map((n) => (
              <span key={n} className="font-sans text-warn">
                {n}
              </span>
            ))}
        </div>
      </div>
      <div className="flex shrink-0 gap-1">
        <button disabled={busy} onClick={() => act("reject")} className="rounded-lg border border-line p-1.5 text-faint transition hover:border-danger/40 hover:text-danger" aria-label="Not true">
          <X className="size-4" />
        </button>
        <button disabled={busy} onClick={() => act("approve")} className="rounded-lg border border-line p-1.5 text-faint transition hover:border-ok/40 hover:text-ok" aria-label="Confirm">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
        </button>
      </div>
    </li>
  );
}

export function ReviewQueue({ proposals: initialProposals, pending: initialPending }: { proposals: Proposal[]; pending: Memory[] }) {
  const router = useRouter();
  const [proposals, setProposals] = useState(initialProposals);
  const [pending, setPending] = useState(initialPending);
  const [bulk, setBulk] = useState(false);

  async function bulkApprove() {
    const n = pending.filter((m) => m.sensitivity !== "sensitive").length;
    if (!confirm(`confirm all ${n} non-sensitive facts as true? sensitive ones stay for one by one review.`)) return;
    setBulk(true);
    try {
      const res = await api<{ approved: number }>("/api/memories/bulk-approve", { method: "POST", json: { sensitivity: ["normal", "private"] } });
      toast.success(`${res.approved} confirmed`);
      setPending((p) => p.filter((m) => m.sensitivity === "sensitive"));
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBulk(false);
    }
  }

  const grouped = pending.reduce<Record<string, Memory[]>>((acc, m) => {
    (acc[m.section] ??= []).push(m);
    return acc;
  }, {});

  if (!proposals.length && !pending.length) {
    return (
      <EmptyState icon={<CheckCheck />} title="inbox zero, brain edition">
        everything&apos;s reviewed. hit Learn in a chat and I&apos;ll find new stuff worth remembering.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-8">
      {proposals.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium">
            new from your chats <span className="font-mono text-faint">· {proposals.length}</span>
          </h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {proposals.map((p) => (
              <ProposalCard key={p._id} p={p} onDone={(id) => (setProposals((x) => x.filter((y) => y._id !== id)), router.refresh())} />
            ))}
          </div>
        </section>
      )}
      {pending.length > 0 && (
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-medium">
              not confirmed yet <span className="font-mono text-faint">· {pending.length}</span>
            </h2>
            <Button size="sm" onClick={bulkApprove} disabled={bulk}>
              {bulk ? <Loader2 className="animate-spin" /> : <CheckCheck />} confirm all non-sensitive
            </Button>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {Object.entries(grouped).map(([section, items]) => (
              <Card key={section} className="px-4 py-2">
                <p className="pt-2 font-mono text-[10.5px] uppercase tracking-[0.16em] text-faint">
                  {SECTION_LABEL[section as Memory["section"]]} · {items.length}
                </p>
                <ul>
                  {items.map((m) => (
                    <PendingRow key={m._id} m={m} onDone={(id) => (setPending((x) => x.filter((y) => y._id !== id)), router.refresh())} />
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
