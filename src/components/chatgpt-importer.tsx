"use client";

import { Brain, Check, FileArchive, HelpCircle, Loader2, Upload, User, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { parseChatGptExport, type GptConversation } from "@/lib/importers/chatgpt";
import { listZip, readZipText } from "@/lib/importers/zip";
import { Badge, Button, Card, Input, SquiggleTab } from "@/components/ui";
import { api, cn, formatWhen } from "@/lib/utils";

type Author = "aditya" | "mother" | "unknown" | null;
type Row = { _id: string; title: string; messageCount: number; selfCount: number; firstAt: string | null; lastAt: string | null; author?: Author; authorConfidence?: number | null; authorReason?: string | null; authorBy?: "ai" | "owner" | null; learnedAt?: string | null };
export type ChatGptStatus = { total: number; aditya: number; mother: number; unknown: number; unsorted: number; learned: number; conversations: Row[]; estimate: { conversations: number; tokens: number; usd: number } };

const AUTHOR_LABEL: Record<string, string> = { aditya: "you", mother: "mom", unknown: "not sure" };

/** Group conversations into requests that stay under Vercel's body limit. */
function batches(convs: GptConversation[], maxBytes = 3_200_000) {
  const out: GptConversation[][] = [];
  let cur: GptConversation[] = [];
  let size = 0;
  for (const c of convs) {
    const s = JSON.stringify(c).length;
    if (cur.length && (size + s > maxBytes || cur.length >= 150)) {
      out.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(c);
    size += s;
  }
  if (cur.length) out.push(cur);
  return out;
}

export function ChatGptImporter({ initial }: { initial: ChatGptStatus }) {
  const router = useRouter();
  const [status, setStatus] = useState(initial);
  const [parsed, setParsed] = useState<GptConversation[] | null>(null);
  const [reading, setReading] = useState(false);
  const [progress, setProgress] = useState<{ label: string; done: number; total: number } | null>(null);
  const [tab, setTab] = useState<"unknown" | "mother" | "aditya">(initial.unknown ? "unknown" : "aditya");
  const [q, setQ] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = async () => setStatus(await api<ChatGptStatus>("/api/chatgpt"));

  async function onFile(file: File) {
    setReading(true);
    try {
      let text: string;
      if (/\.zip$/i.test(file.name)) {
        const entries = await listZip(file);
        const e = entries.find((x) => /(^|\/)conversations\.json$/i.test(x.name));
        if (!e) throw new Error("no conversations.json in that zip. is it the ChatGPT export?");
        text = await readZipText(file, e);
      } else text = await file.text();
      const convs = parseChatGptExport(JSON.parse(text));
      if (!convs.length) throw new Error("couldn't find any conversations in that file");
      setParsed(convs);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "couldn't read that file");
    } finally {
      setReading(false);
    }
  }

  async function runImport() {
    if (!parsed) return;
    const groups = batches(parsed);
    setProgress({ label: "importing", done: 0, total: parsed.length });
    let done = 0;
    try {
      for (const g of groups) {
        await api("/api/imports/chatgpt", { method: "POST", json: { conversations: g } });
        done += g.length;
        setProgress({ label: "importing", done, total: parsed.length });
      }
      toast.success(`imported ${parsed.length} conversations, encrypted`);
      setParsed(null);
      await reload();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "import failed");
    } finally {
      setProgress(null);
    }
  }

  async function loop(action: "classify" | "learn") {
    const start = action === "classify" ? status.unsorted : status.estimate.conversations;
    setProgress({ label: action === "classify" ? "working out who wrote what" : "learning from your conversations", done: 0, total: start });
    let added = 0;
    try {
      for (let i = 0; i < 400; i++) {
        const r = await api<{ left: number; added?: number }>("/api/chatgpt", { method: "POST", json: { action } });
        added += r.added ?? 0;
        setProgress({ label: action === "classify" ? "working out who wrote what" : "learning from your conversations", done: Math.max(0, start - r.left), total: start });
        if (!r.left) break;
      }
      await reload();
      if (action === "learn") toast.success(`learned ${added} new things. they're marked unverified until you confirm them in review`);
      else toast.success("sorted. check the 'not sure' ones");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed");
      await reload();
    } finally {
      setProgress(null);
    }
  }

  async function setAuthor(row: Row, author: "aditya" | "mother") {
    setStatus((s) => ({ ...s, conversations: s.conversations.map((c) => (c._id === row._id ? { ...c, author, authorBy: "owner" } : c)) }));
    try {
      await api("/api/chatgpt", { method: "POST", json: { action: "author", threadId: row._id, author } });
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed");
      await reload();
    }
  }

  const preview = useMemo(() => {
    if (!parsed) return null;
    const msgs = parsed.reduce((s, c) => s + c.messages.length, 0);
    const yours = parsed.reduce((s, c) => s + c.messages.filter((m) => m.sender === "you").length, 0);
    return { convs: parsed.length, msgs, yours, from: parsed[0]?.createdAt, to: parsed.at(-1)?.updatedAt };
  }, [parsed]);

  const list = status.conversations.filter((c) => (c.author ?? "unknown") === tab || (tab === "unknown" && !c.author)).filter((c) => !q || c.title.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex flex-wrap items-center gap-3">
          <FileArchive className="size-5 text-accent" />
          <div className="flex-1">
            <p className="text-sm font-medium text-fg">{status.total ? "add a newer export" : "drop your ChatGPT export"}</p>
            <p className="text-xs text-faint">the .zip from ChatGPT → settings → data controls → export data. read on this laptop, only conversations get uploaded, encrypted. re-importing only adds what&apos;s new.</p>
          </div>
          <input ref={fileRef} type="file" accept=".zip,.json,application/zip,application/json" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={reading || Boolean(progress)}>
            {reading ? <Loader2 className="animate-spin" /> : <Upload />} choose file
          </Button>
        </div>
        {preview && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-accent-line bg-accent-soft px-4 py-3">
            <p className="flex-1 text-sm text-fg">
              {preview.convs} conversations, {preview.msgs.toLocaleString("en-IN")} messages ({preview.yours.toLocaleString("en-IN")} typed on your side), {formatWhen(preview.from)} to {formatWhen(preview.to)}
            </p>
            <Button variant="primary" size="sm" onClick={runImport} disabled={Boolean(progress)}>
              <Check /> import
            </Button>
          </div>
        )}
        {progress && (
          <div className="mt-4">
            <p className="mb-1.5 flex items-center gap-2 text-xs text-muted">
              <Loader2 className="size-3.5 animate-spin" /> {progress.label}… {progress.done}/{progress.total}
            </p>
            <div className="h-1.5 overflow-hidden rounded-full bg-panel-2">
              <div className="h-full rounded-full bg-grad transition-all" style={{ width: `${progress.total ? Math.max(3, (progress.done / progress.total) * 100) : 3}%` }} />
            </div>
          </div>
        )}
      </Card>

      {status.total > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="p-6">
            <p className="mb-2 flex items-center gap-1.5 font-mono text-[11px] text-faint">
              <Users className="size-3" /> {"// who wrote what"}
            </p>
            <p className="text-sm text-muted">
              you share this ChatGPT with your mom. each conversation gets labelled; only yours ever teach me anything about you. hers stay hers.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge tone="accent">you {status.aditya}</Badge>
              <Badge tone="info">mom {status.mother}</Badge>
              <Badge tone="warn">not sure {status.unknown}</Badge>
              {status.unsorted > 0 && <Badge>unsorted {status.unsorted}</Badge>}
            </div>
            {status.unsorted > 0 && (
              <Button className="mt-4" variant="primary" size="sm" onClick={() => loop("classify")} disabled={Boolean(progress)}>
                <Users /> sort {status.unsorted} conversations
              </Button>
            )}
          </Card>
          <Card className="p-6">
            <p className="mb-2 flex items-center gap-1.5 font-mono text-[11px] text-faint">
              <Brain className="size-3" /> {"// learn from yours"}
            </p>
            <p className="text-sm text-muted">
              reads only your side of your conversations and pulls out projects, decisions, ideas and plans. they come in unverified, confirm them in{" "}
              <Link href="/review" className="text-accent hover:underline">
                review
              </Link>
              .
            </p>
            <p className="mt-3 font-mono text-[11px] text-faint">
              {status.learned} learned · {status.estimate.conversations} to go
              {status.estimate.conversations ? ` · about ${Math.round(status.estimate.tokens / 1000)}k tokens, roughly $${status.estimate.usd.toFixed(2)}` : ""}
            </p>
            {status.estimate.conversations > 0 && (
              <Button className="mt-4" variant="primary" size="sm" onClick={() => loop("learn")} disabled={Boolean(progress) || status.unsorted > 0}>
                <Brain /> learn from {status.estimate.conversations} of mine
              </Button>
            )}
            {status.unsorted > 0 && <p className="mt-2 text-xs text-faint">sort them first, so nothing of your mom&apos;s gets mixed in.</p>}
          </Card>
        </div>
      )}

      {status.total > 0 && (
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2">
            {(["unknown", "mother", "aditya"] as const).map((t) => (
              <SquiggleTab key={t} active={tab === t} icon={t === "unknown" ? HelpCircle : t === "mother" ? Users : User} onClick={() => setTab(t)}>
                {AUTHOR_LABEL[t]} <span className="ml-1 font-mono text-[11px] text-faint">{t === "unknown" ? status.unknown + status.unsorted : t === "mother" ? status.mother : status.aditya}</span>
              </SquiggleTab>
            ))}
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="search titles" className="ml-auto h-9 w-48 text-sm" />
          </div>
          <Card className="p-2">
            {list.length === 0 ? (
              <p className="p-4 text-sm text-faint">nothing here.</p>
            ) : (
              <ul className="max-h-[560px] overflow-y-auto">
                {list.slice(0, 300).map((c) => (
                  <li key={c._id} className="flex items-center gap-3 rounded-2xl px-3 py-2 hover:bg-panel-2/60">
                    <div className="min-w-0 flex-1">
                      <Link href={`/chats/${c._id}`} className="block truncate text-sm text-fg hover:text-accent">
                        {c.title}
                      </Link>
                      <p className="truncate text-[11px] text-faint">
                        {formatWhen(c.firstAt)} · {c.messageCount} msgs{c.authorReason ? ` · ${c.authorBy === "owner" ? "you said" : c.authorReason}` : ""}
                        {c.learnedAt ? " · learned" : ""}
                      </p>
                    </div>
                    <button type="button" onClick={() => setAuthor(c, "aditya")} className={cn("rounded-full px-2.5 py-1 text-[11px] transition", c.author === "aditya" ? "bg-grad text-accent-ink" : "bg-panel-2 text-muted hover:text-fg")}>
                      me
                    </button>
                    <button type="button" onClick={() => setAuthor(c, "mother")} className={cn("rounded-full px-2.5 py-1 text-[11px] transition", c.author === "mother" ? "bg-info/20 text-info" : "bg-panel-2 text-muted hover:text-fg")}>
                      mom
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
