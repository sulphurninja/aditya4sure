"use client";

import { ArrowLeft, AudioLines, Check, FileText, FileUp, Film, ImageIcon, Loader2, Lock, Search, ShieldCheck, Sticker, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { SourceIcon } from "@/components/source-icon";
import { Button, Input, SquiggleTab } from "@/components/ui";
import { guessSelf, type ParsedThread } from "@/lib/importers/common";
import { IG_MESSAGE_FILE, parseInstagram, summarizeInstagramFiles, type IgThreadSummary } from "@/lib/importers/instagram";
import { planMedia, summarizePlan, uploadMedia, type MediaPlanItem } from "@/lib/importers/media-browser";
import { parseWhatsApp, parseWhatsAppWithOrder, type DateOrder } from "@/lib/importers/whatsapp";
import { listZip, readZipText, type ZipEntry } from "@/lib/importers/zip";
import { cn, formatWhen } from "@/lib/utils";

const OWNER_NAMES = ["Aditya", "Aditya Pingle", "aditya4sure", "sulphurninja", "You"];
const BATCH = 1000; // keeps each request well under Vercel's 4.5 MB body limit

type Stage = "pick" | "ig-list" | "preview" | "importing" | "media" | "bulk" | "done";

function mb(bytes: number) {
  return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.max(0.1, bytes / 1e6).toFixed(bytes > 1e7 ? 0 : 1)} MB`;
}

export function ImportWizard({ onClose }: { onClose?: () => void }) {
  const router = useRouter();
  const [source, setSource] = useState<"whatsapp" | "instagram">("whatsapp");
  const [stage, setStage] = useState<Stage>("pick");
  const [reading, setReading] = useState(false);
  const [thread, setThread] = useState<ParsedThread | null>(null);
  const [waText, setWaText] = useState<{ text: string; fileName: string } | null>(null);
  const [order, setOrder] = useState<DateOrder>("DMY");
  const [zip, setZip] = useState<{ file: File; entries: ZipEntry[] } | null>(null);
  const [igTexts, setIgTexts] = useState<Map<string, string>>(new Map());
  const [igThreads, setIgThreads] = useState<IgThreadSummary[]>([]);
  const [igFilter, setIgFilter] = useState("");
  const [title, setTitle] = useState("");
  const [self, setSelf] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [withMedia, setWithMedia] = useState(true);
  const [progress, setProgress] = useState({ sent: 0, inserted: 0, total: 0 });
  const [mediaProgress, setMediaProgress] = useState({ done: 0, total: 0, stored: 0, failed: 0 });
  const [threadId, setThreadId] = useState<string | null>(null);
  const [bulk, setBulk] = useState({ i: 0, n: 0, title: "", messages: 0, media: 0 });
  const fileRef = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);

  const plan: MediaPlanItem[] = useMemo(() => (thread && zip ? planMedia(thread.messages, zip.entries) : []), [thread, zip]);
  const media = useMemo(() => summarizePlan(plan), [plan]);

  function adopt(t: ParsedThread) {
    setThread(t);
    setTitle(t.title);
    setSelf(guessSelf(t.participants, OWNER_NAMES));
    setStage("preview");
  }

  async function onFiles(list: FileList | null) {
    if (!list?.length) return;
    setReading(true);
    try {
      if (source === "whatsapp") {
        const f = list[0];
        let text: string;
        if (/\.zip$/i.test(f.name)) {
          const entries = await listZip(f);
          const chat = entries.find((e) => /(^|\/)(_chat|WhatsApp Chat[^/]*)\.txt$/i.test(e.name)) ?? entries.find((e) => /\.txt$/i.test(e.name));
          if (!chat) throw new Error("No chat .txt inside this zip.");
          text = await readZipText(f, chat);
          setZip({ file: f, entries });
        } else {
          text = await f.text();
          setZip(null);
        }
        const t = parseWhatsApp(text, { fileName: f.name });
        if (!t.messages.length) throw new Error(t.warnings[0] ?? "No messages found");
        setWaText({ text, fileName: f.name });
        setOrder(t.dateOrder);
        adopt(t);
      } else {
        const texts = new Map<string, string>();
        let zipRef: { file: File; entries: ZipEntry[] } | null = null;
        for (const f of Array.from(list)) {
          if (/\.zip$/i.test(f.name)) {
            const entries = await listZip(f);
            zipRef = { file: f, entries };
            for (const e of entries.filter((x) => IG_MESSAGE_FILE.test(x.name))) texts.set(e.name, await readZipText(f, e));
          } else if (/\.json$/i.test(f.name)) {
            texts.set(`messages/inbox/selected/${f.name}`, await f.text());
          }
        }
        setZip(zipRef);
        const summaries = summarizeInstagramFiles(texts);
        if (!summaries.length) throw new Error("No Instagram conversations found. Export in JSON format and include Messages.");
        setIgTexts(texts);
        if (summaries.length === 1) adopt(parseInstagram(summaries[0].files.map((p) => texts.get(p)!)));
        else {
          setIgThreads(summaries);
          setStage("ig-list");
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "couldn't read that file");
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function flipOrder(next: DateOrder) {
    if (!waText) return;
    setOrder(next);
    const t = parseWhatsAppWithOrder(waText.text, next, { fileName: waText.fileName });
    setThread({ ...t, title });
  }

  async function runImport() {
    if (!thread) return;
    setStage("importing");
    setProgress({ sent: 0, inserted: 0, total: thread.messages.length });
    let id: string | null = null;
    try {
      const res = await fetch("/api/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: thread.source, title: title.trim() || thread.title, participants: thread.participants.length ? thread.participants : ["unknown"], selfName: self, consent: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "couldn't start the import");
      id = data.thread._id as string;
      setThreadId(id);
      let inserted = 0;
      for (let i = 0; i < thread.messages.length; i += BATCH) {
        const r = await fetch(`/api/threads/${id}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: thread.messages.slice(i, i + BATCH) }) });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "batch failed");
        inserted += d.inserted;
        setProgress({ sent: Math.min(i + BATCH, thread.messages.length), inserted, total: thread.messages.length });
      }
      await fetch(`/api/threads/${id}/finalize`, { method: "POST" });

      if (zip && plan.length) {
        setStage("media");
        abort.current = new AbortController();
        await uploadMedia(zip.file, id, plan, { includeVisual: withMedia, onProgress: setMediaProgress, signal: abort.current.signal });
      }
      setStage("done");
      toast.success(data.existed ? `merged in ${inserted} new messages` : `${inserted.toLocaleString()} messages in. let's go`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "import failed");
      setStage(id ? "done" : "preview");
    }
  }

  const stats = useMemo(() => {
    if (!thread) return null;
    const counts = new Map<string, number>();
    for (const m of thread.messages) if (m.kind !== "system") counts.set(m.sender, (counts.get(m.sender) ?? 0) + 1);
    return { first: thread.messages[0]?.at ?? null, last: thread.messages[thread.messages.length - 1]?.at ?? null, counts, tail: thread.messages.filter((m) => m.kind === "text").slice(-6) };
  }, [thread]);

  /** Import every Instagram conversation in the export, photos and video frames included. */
  async function importAll() {
    if (!zip) return toast.error("drop the full zip to import everything");
    if (!confirm(`import all ${igThreads.length} conversations? they're stored encrypted, and you can delete any of them later.`)) return;
    setStage("bulk");
    abort.current = new AbortController();
    const parsed = igThreads.map((t) => parseInstagram(t.files.map((p) => igTexts.get(p)!)));
    const presence = new Map<string, number>();
    for (const t of parsed) for (const p of new Set(t.messages.map((m) => m.sender))) presence.set(p, (presence.get(p) ?? 0) + 1);
    const me = [...presence.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    let messages = 0;
    let mediaCount = 0;
    try {
      for (const [i, t] of parsed.entries()) {
        if (abort.current.signal.aborted) break;
        setBulk({ i: i + 1, n: parsed.length, title: t.title, messages, media: mediaCount });
        if (!t.messages.length) continue;
        const res = await fetch("/api/threads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source: "instagram", title: t.title.slice(0, 160), participants: t.participants.length ? t.participants : [...new Set(t.messages.map((m) => m.sender))], selfName: me, consent: true }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error ?? "failed");
        for (let k = 0; k < t.messages.length; k += BATCH) {
          const r = await fetch(`/api/threads/${d.thread._id}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: t.messages.slice(k, k + BATCH) }) });
          const x = await r.json();
          if (!r.ok) throw new Error(x.error ?? "batch failed");
          messages += x.inserted;
        }
        await fetch(`/api/threads/${d.thread._id}/finalize`, { method: "POST" });
        const p = planMedia(t.messages, zip.entries);
        if (p.length) {
          const out = await uploadMedia(zip.file, d.thread._id, p, { includeVisual: true, onProgress: () => {}, signal: abort.current.signal });
          mediaCount += out.stored;
        }
      }
      setBulk((b) => ({ ...b, messages, media: mediaCount }));
      setThreadId(null);
      setStage("done");
      toast.success(`all in. ${messages.toLocaleString()} new messages, ${mediaCount} media`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "bulk import failed");
      setStage("ig-list");
    }
  }

  const reset = () => {
    abort.current?.abort();
    setStage("pick");
    setThread(null);
    setConsent(false);
    setIgThreads([]);
    setZip(null);
  };

  const bar = (value: number, total: number) => (
    <div className="mx-auto mt-5 h-1.5 max-w-md overflow-hidden rounded-full bg-panel-2">
      <div className="h-full rounded-full bg-grad transition-all" style={{ width: `${(value / Math.max(1, total)) * 100}%` }} />
    </div>
  );

  const mediaRows: [React.ElementType, number, string][] = [
    [ImageIcon, media.photos, "photos"],
    [Film, media.videos, "videos"],
    [AudioLines, media.voiceNotes, "voice notes"],
    [Sticker, media.stickers, "stickers"],
    [FileText, media.documents, "docs"],
  ];

  return (
    <div className="sheet relative overflow-hidden">
      <div className="dashed-bottom flex items-center gap-6 px-6 pb-3 pt-4">
        {(["whatsapp", "instagram"] as const).map((s) => (
          <SquiggleTab
            key={s}
            active={source === s}
            onClick={() => {
              setSource(s);
              reset();
            }}
          >
            <span className="inline-flex items-center gap-2">
              <SourceIcon source={s} className="size-[18px]" />
              {s}
            </span>
          </SquiggleTab>
        ))}
        {onClose && (
          <button onClick={onClose} className="ml-auto text-faint transition hover:rotate-90 hover:text-fg" aria-label="Close">
            <X className="size-5" />
          </button>
        )}
      </div>

      <div className="p-6">
        {stage === "pick" && (
          <div className="grid gap-6 md:grid-cols-[1fr_1.1fr]">
            <button
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void onFiles(e.dataTransfer.files);
              }}
              className="group flex min-h-60 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-line-strong p-6 text-center transition hover:border-accent-line hover:bg-accent-soft"
            >
              {reading ? <Loader2 className="size-8 animate-spin text-accent" /> : <FileUp className="size-8 text-accent transition group-hover:-translate-y-1 group-hover:-rotate-6" />}
              <p className="mt-4 font-display text-lg font-semibold">{reading ? "reading it on your device…" : "drop your export here"}</p>
              <p className="mt-1 text-sm text-muted">{source === "whatsapp" ? ".zip with media works, even big ones. or just the .txt" : "Instagram .zip (JSON format), or message_*.json files"}</p>
            </button>
            <div className="space-y-3 text-sm text-muted">
              <p className="font-mono text-[11px] text-faint">{"// how to get it"}</p>
              {source === "whatsapp" ? (
                <ol className="list-decimal space-y-1.5 pl-5">
                  <li>open the chat in WhatsApp on your phone</li>
                  <li>
                    ⋮ or the name → More → <strong className="text-fg">Export chat</strong>
                  </li>
                  <li>
                    <strong className="text-fg">include media</strong> if you want me to see your photos
                  </li>
                  <li>send it to yourself, drop the .zip here</li>
                </ol>
              ) : (
                <ol className="list-decimal space-y-1.5 pl-5">
                  <li>Instagram → Accounts Center → Your information and permissions</li>
                  <li>
                    <strong className="text-fg">Download your information</strong> → Some of your information → Messages
                  </li>
                  <li>
                    format <strong className="text-fg">JSON</strong>, media quality low
                  </li>
                  <li>drop the zip here, you&apos;ll pick the convo</li>
                </ol>
              )}
              <p className="flex items-start gap-2 rounded-xl bg-panel-2 p-3 text-xs">
                <Lock className="mt-0.5 size-3.5 shrink-0 text-accent" />
                everything is read in your browser. only the convo you pick gets uploaded: messages encrypted, photos shrunk to ~60 KB and encrypted. raw videos and audio never leave your laptop.
              </p>
            </div>
            <input
              ref={fileRef}
              type="file"
              hidden
              multiple={source === "instagram"}
              accept={source === "whatsapp" ? ".txt,.zip,text/plain,application/zip" : ".zip,.json,application/zip,application/json"}
              onChange={(e) => onFiles(e.target.files)}
            />
          </div>
        )}

        {stage === "ig-list" && (
          <div>
            <div className="mb-4 flex items-center gap-3">
              <button onClick={reset} className="text-muted hover:text-fg" aria-label="Back">
                <ArrowLeft className="size-5" />
              </button>
              <p className="font-display text-lg font-semibold">{igThreads.length} convos in there, pick one</p>
              {zip && igThreads.length > 1 && (
                <Button size="sm" variant="primary" className="ml-auto" onClick={importAll}>
                  import all {igThreads.length}
                </Button>
              )}
            </div>
            <div className="relative mb-3">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-faint" />
              <Input value={igFilter} onChange={(e) => setIgFilter(e.target.value)} placeholder="search by name…" className="pl-10" />
            </div>
            <ul className="max-h-[420px] overflow-y-auto">
              {igThreads
                .filter((t) => !igFilter || t.title.toLowerCase().includes(igFilter.toLowerCase()))
                .map((t) => (
                  <li key={t.folder} className="dashed-bottom last:border-0">
                    <button onClick={() => adopt(parseInstagram(t.files.map((p) => igTexts.get(p)!)))} className="group flex w-full items-center justify-between gap-3 px-2 py-3 text-left">
                      <span>
                        <span className="block font-medium text-fg group-hover:text-accent">{t.title}</span>
                        <span className="text-xs text-faint">{t.participants.join(", ")}</span>
                      </span>
                      <span className="shrink-0 text-right font-mono text-[11px] text-faint">
                        {t.count} msgs
                        <br />
                        {formatWhen(t.lastAt)}
                      </span>
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        )}

        {stage === "preview" && thread && stats && (
          <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <button onClick={reset} className="text-muted hover:text-fg" aria-label="Back">
                  <ArrowLeft className="size-5" />
                </button>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} className="font-display text-lg font-semibold" />
              </div>
              <div className="grid grid-cols-3 divide-x divide-dashed divide-line-strong rounded-xl border border-line text-center">
                <div className="p-3">
                  <p className="font-display text-xl font-bold">{thread.messages.length.toLocaleString()}</p>
                  <p className="font-mono text-[10.5px] text-faint">messages</p>
                </div>
                <div className="p-3">
                  <p className="font-display text-sm font-bold">{formatWhen(stats.first)}</p>
                  <p className="font-mono text-[10.5px] text-faint">first</p>
                </div>
                <div className="p-3">
                  <p className="font-display text-sm font-bold">{formatWhen(stats.last)}</p>
                  <p className="font-mono text-[10.5px] text-faint">latest</p>
                </div>
              </div>

              {plan.length > 0 && (
                <div className="rounded-xl border border-line p-4">
                  <p className="mb-3 font-mono text-[11px] text-faint">{`// media in this export (${mb(media.rawBytes)})`}</p>
                  <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
                    {mediaRows
                      .filter(([, n]) => n > 0)
                      .map(([Icon, n, label]) => (
                        <span key={label} className="inline-flex items-center gap-1.5 text-muted">
                          <Icon className="size-4 text-accent" /> <strong className="text-fg">{n.toLocaleString()}</strong> {label}
                        </span>
                      ))}
                  </div>
                  <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm text-muted">
                    <input type="checkbox" checked={withMedia} onChange={(e) => setWithMedia(e.target.checked)} className="mt-1 accent-accent" />
                    <span>
                      bring photos + a frame from each video so I can actually see them. shrunk and encrypted, about <strong className="text-fg">{mb(media.estimatedStoredBytes)}</strong> in your DB.
                      {media.voiceNotes > 0 && <span className="mt-1 block text-xs text-faint">voice notes stay as markers for now, Claude can&apos;t listen to audio yet.</span>}
                    </span>
                  </label>
                </div>
              )}

              <div>
                <p className="mb-2 text-sm font-medium">which one is you?</p>
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {thread.participants.map((p) => (
                    <SquiggleTab key={p} active={self === p} onClick={() => setSelf(p)}>
                      {p} <span className="ml-1 font-mono text-[10px] font-normal text-faint">{stats.counts.get(p) ?? 0}</span>
                    </SquiggleTab>
                  ))}
                </div>
                {!self && <p className="mt-2 text-xs text-warn">pick yourself so your texts sit on the right and can teach your voice.</p>}
              </div>
              {thread.source === "whatsapp" && (
                <div className="flex items-center gap-4 text-xs text-muted">
                  <span className="font-mono text-faint">{"// date format"}</span>
                  {(["DMY", "MDY"] as const).map((o) => (
                    <SquiggleTab key={o} active={order === o} onClick={() => flipOrder(o)} className="text-xs">
                      {o === "DMY" ? "DD/MM" : "MM/DD"}
                    </SquiggleTab>
                  ))}
                </div>
              )}
              {thread.warnings.length > 0 && (
                <ul className="space-y-1 text-xs text-warn">
                  {thread.warnings.map((w) => (
                    <li key={w}>• {w}</li>
                  ))}
                </ul>
              )}
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-dashed border-line-strong p-3 text-sm text-muted">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 accent-accent" />
                <span>I&apos;m in this convo and I want it stored privately in my brain. encrypted, and I can delete it whenever.</span>
              </label>
              <Button variant="primary" size="lg" className="w-full" onClick={runImport} disabled={!consent}>
                <ShieldCheck /> import {thread.messages.length.toLocaleString()} messages
                {plan.length > 0 && withMedia ? ` + ${(media.photos + media.videos).toLocaleString()} photos` : ""}
              </Button>
            </div>
            <div className="rounded-2xl border border-line bg-bg/40 p-4">
              <p className="mb-3 font-mono text-[11px] text-faint">{"// latest messages"}</p>
              <div className="space-y-2">
                {stats.tail.map((m, i) => {
                  const mine = m.sender === self;
                  return (
                    <div key={i} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                      <div className={cn("max-w-[80%] rounded-2xl px-3 py-2 text-sm", mine ? "bg-grad text-accent-ink" : "border border-line bg-panel-solid")}>
                        {!mine && <p className="mb-0.5 text-[10.5px] font-semibold text-accent">{m.sender}</p>}
                        <p className="line-clamp-4 whitespace-pre-wrap">{m.text}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {stage === "importing" && (
          <div className="py-12 text-center">
            <Loader2 className="mx-auto size-8 animate-spin text-accent" />
            <p className="mt-4 font-display text-lg font-semibold">encrypting & saving messages…</p>
            {bar(progress.sent, progress.total)}
            <p className="mt-2 font-mono text-xs text-faint">
              {progress.sent.toLocaleString()} / {progress.total.toLocaleString()}
            </p>
          </div>
        )}

        {stage === "media" && (
          <div className="py-12 text-center">
            <ImageIcon className="mx-auto size-8 animate-pulse-soft text-accent" />
            <p className="mt-4 font-display text-lg font-semibold">{withMedia ? "shrinking & encrypting your photos…" : "linking media markers…"}</p>
            <p className="mt-1 text-sm text-muted">keep this tab open. it&apos;s all happening on your laptop.</p>
            {bar(mediaProgress.done, mediaProgress.total)}
            <p className="mt-2 font-mono text-xs text-faint">
              {mediaProgress.done.toLocaleString()} / {mediaProgress.total.toLocaleString()}
              {mediaProgress.failed ? ` · ${mediaProgress.failed} couldn't be read` : ""}
            </p>
            <button onClick={() => abort.current?.abort()} className="mt-4 text-xs text-faint underline-offset-4 hover:text-fg hover:underline">
              stop here (re-import later, nothing duplicates)
            </button>
          </div>
        )}

        {stage === "bulk" && (
          <div className="py-12 text-center">
            <Loader2 className="mx-auto size-8 animate-spin text-accent" />
            <p className="mt-4 font-display text-lg font-semibold">importing {bulk.title || "…"}</p>
            <p className="mt-1 text-sm text-muted">
              convo {bulk.i} of {bulk.n}. keep this tab open.
            </p>
            {bar(bulk.i, bulk.n)}
            <p className="mt-2 font-mono text-xs text-faint">
              {bulk.messages.toLocaleString()} messages · {bulk.media.toLocaleString()} media so far
            </p>
            <button onClick={() => abort.current?.abort()} className="mt-4 text-xs text-faint underline-offset-4 hover:text-fg hover:underline">
              stop after this one
            </button>
          </div>
        )}

        {stage === "done" && !threadId && (
          <div className="py-12 text-center">
            <span className="mx-auto grid size-14 place-items-center rounded-full bg-grad text-accent-ink">
              <Check className="size-7" />
            </span>
            <p className="mt-4 font-display text-2xl font-bold">all your convos are in</p>
            <p className="mt-1 text-sm text-muted">
              {bulk.messages.toLocaleString()} new messages · {bulk.media.toLocaleString()} media across {bulk.n} chats
            </p>
            <div className="mt-6 flex justify-center gap-2">
              <Button variant="primary" onClick={() => (onClose ? onClose() : router.push("/chats"))}>
                see them
              </Button>
            </div>
          </div>
        )}

        {stage === "done" && threadId && (
          <div className="py-12 text-center">
            <span className="mx-auto grid size-14 place-items-center rounded-full bg-grad text-accent-ink">
              <Check className="size-7" />
            </span>
            <p className="mt-4 font-display text-2xl font-bold">chat&apos;s in</p>
            <p className="mt-1 text-sm text-muted">
              {progress.inserted.toLocaleString()} new messages{mediaProgress.stored ? ` · ${mediaProgress.stored.toLocaleString()} media` : ""}
            </p>
            {mediaProgress.stored > 0 && <p className="mt-1 text-xs text-faint">open it and hit &quot;describe photos&quot; so I actually get what&apos;s in them.</p>}
            <div className="mt-6 flex justify-center gap-2">
              <Button variant="primary" onClick={() => router.push(`/chats/${threadId}`)}>
                open it
              </Button>
              <Button onClick={reset}>import another</Button>
            </div>
          </div>
        )}
      </div>
      <div className="dashed-top flex items-center gap-2 px-6 py-3 font-mono text-[10.5px] text-faint">
        <Lock className="size-3" /> aes-256 at rest · re-importing the same export never duplicates
      </div>
    </div>
  );
}
