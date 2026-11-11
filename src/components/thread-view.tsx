"use client";

import {
  ArrowLeft,
  AudioLines,
  Ban,
  Brain,
  ChevronDown,
  Eye,
  FileText,
  Film,
  ImageIcon,
  Loader2,
  MoreHorizontal,
  Pause,
  RotateCcw,
  Search,
  Sparkles,
  Sticker,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { ImportedThread, MediaKind, ThreadMessage, Wallpaper } from "@/lib/domain";
import { mediaCaption } from "@/lib/importers/whatsapp";
import { mediaKind } from "@/lib/importers/zip";
import { SourceIcon } from "@/components/source-icon";
import { WallpaperLayer, WallpaperPicker } from "@/components/wallpaper";
import { Button, MenuDivider, MenuItem, MenuLabel, MenuSheet } from "@/components/ui";
import { cn } from "@/lib/utils";

type MediaStats = { pending: number; done: number; failed: number; photos: number; videos: number; voiceNotes: number; stickers: number; storedBytes: number; attachments: number; mediaMessages: number };

/** Rough $ per photo for vision description (≈1.1k input + 180 output tokens). */
const PER_PHOTO_USD: Record<string, number> = {
  "claude-opus-5-5": 0.008,
  "claude-sonnet-5-5": 0.004,
  "claude-haiku-5-5": 0.0002,
  "claude-fable-5-1": 0.02,
};

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(today);
  y.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "today";
  if (same(d, y)) return "yesterday";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });

function Highlight({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig"));
  return (
    <>
      {parts.map((p, i) =>
        p.toLowerCase() === q.toLowerCase() ? (
          <mark key={i} className="rounded bg-accent-3/60 px-0.5 text-inherit">
            {p}
          </mark>
        ) : (
          p
        ),
      )}
    </>
  );
}

const KIND_ICON: Record<MediaKind, React.ElementType> = { image: ImageIcon, video: Film, audio: AudioLines, sticker: Sticker, document: FileText };
const KIND_LABEL: Record<MediaKind, string> = { image: "photo", video: "video", audio: "voice note", sticker: "sticker", document: "file" };

function MediaBody({ m, q, onOpen }: { m: ThreadMessage; q: string; onOpen: (m: ThreadMessage) => void }) {
  const kind: MediaKind = m.media?.kind ?? (m.attachment ? mediaKind(m.attachment) : "document");
  const caption = mediaCaption(m.text);
  const showCaption = caption && !/omitted|^<|^null$|^(photo|video|voice note|attachment)$/i.test(caption);
  const hasImage = m.media && (kind === "image" || kind === "video") && m.media.status !== "skipped";
  const Icon = KIND_ICON[kind];
  return (
    <div>
      {hasImage ? (
        <button onClick={() => onOpen(m)} className="relative -mx-1.5 -mt-0.5 mb-1 block overflow-hidden rounded-[14px]">
          {/* eslint-disable-next-line @next/next/no-img-element -- private, authenticated, already downscaled */}
          <img src={`/api/media/${m.media!.id}`} alt={m.media!.description ?? "photo"} loading="lazy" className="max-h-80 w-full min-w-40 object-cover" />
          {kind === "video" && (
            <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white">
              <Film className="size-3" /> video frame
            </span>
          )}
        </button>
      ) : (
        <span className="inline-flex items-center gap-1.5 opacity-85">
          <Icon className="size-4" /> {KIND_LABEL[kind]}
          {kind === "audio" && <span className="text-[11px] opacity-70">(not transcribed yet)</span>}
        </span>
      )}
      {showCaption && (
        <p className="whitespace-pre-wrap break-words">
          <Highlight text={caption} q={q} />
        </p>
      )}
      {m.media?.description && (
        <p className={cn("mt-1 flex gap-1.5 text-[11.5px] leading-snug", m.isSelf ? "text-accent-ink/70" : "text-faint")}>
          <Eye className="mt-0.5 size-3 shrink-0" />
          <span>
            <Highlight text={m.media.description} q={q} />
          </span>
        </p>
      )}
    </div>
  );
}

export function ThreadView({ thread: initialThread, initial, hasMore: initialHasMore, mediaModel }: { thread: ImportedThread; initial: ThreadMessage[]; hasMore: boolean; mediaModel: string }) {
  const router = useRouter();
  const [thread, setThread] = useState(initialThread);
  const [messages, setMessages] = useState(initial);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [stats, setStats] = useState<MediaStats | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [lightbox, setLightbox] = useState<ThreadMessage | null>(null);
  const stopRef = useRef(false);
  const scroller = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const keepOffset = useRef<number | null>(null);

  const loadStats = useCallback(async () => {
    const r = await fetch(`/api/threads/${thread._id}/media`);
    if (r.ok) setStats(await r.json());
  }, [thread._id]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
    fetch(`/api/threads/${thread._id}/media`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: MediaStats | null) => d && setStats(d))
      .catch(() => {});
  }, [thread._id]);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => menuRef.current && !menuRef.current.contains(e.target as Node) && setMenu(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menu]);

  useLayoutEffect(() => {
    if (keepOffset.current != null && scroller.current) {
      scroller.current.scrollTop = scroller.current.scrollHeight - keepOffset.current;
      keepOffset.current = null;
    }
  }, [messages]);

  async function loadEarlier() {
    if (!messages.length) return;
    setLoadingMore(true);
    try {
      const r = await fetch(`/api/threads/${thread._id}/messages?before=${encodeURIComponent(messages[0].at)}&limit=400`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      keepOffset.current = scroller.current ? scroller.current.scrollHeight - scroller.current.scrollTop : null;
      setMessages((m) => [...d.messages, ...m]);
      setHasMore(d.hasMore);
    } catch {
      toast.error("couldn't load earlier messages");
    } finally {
      setLoadingMore(false);
    }
  }

  async function refreshLatest() {
    const r = await fetch(`/api/threads/${thread._id}/messages?limit=${Math.min(1000, Math.max(400, messages.length))}`);
    if (r.ok) {
      const d = await r.json();
      setMessages(d.messages);
      setHasMore(d.hasMore);
    }
  }

  async function patch(body: Partial<Pick<ImportedThread, "selfName" | "title">> & { wallpaper?: Wallpaper }) {
    const r = await fetch(`/api/threads/${thread._id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json();
    if (!r.ok) return toast.error(d.error ?? "failed");
    setThread(d.thread);
    if (body.selfName !== undefined) setMessages((m) => m.map((x) => ({ ...x, isSelf: x.sender === body.selfName })));
  }

  async function describePhotos() {
    setMenu(false);
    setAnalyzing(true);
    stopRef.current = false;
    let total = 0;
    try {
      for (;;) {
        if (stopRef.current) break;
        const r = await fetch(`/api/threads/${thread._id}/media/analyze`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ limit: 6 }) });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "failed");
        total += d.analyzed;
        setStats((s) => (s ? { ...s, pending: d.remaining, done: s.done + d.analyzed, failed: s.failed + d.failed } : s));
        if (d.remaining === 0 || d.analyzed + d.failed === 0) break;
      }
      toast.success(stopRef.current ? `paused. ${total} photos described so far` : `done. I can see ${total} more photos now`);
      await refreshLatest();
      await loadStats();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed");
    } finally {
      setAnalyzing(false);
    }
  }

  async function retryFailed() {
    await fetch(`/api/threads/${thread._id}/media/analyze`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ retryFailed: true }) });
    await loadStats();
  }

  async function learn() {
    setMenu(false);
    setBusy("learn");
    try {
      const r = await fetch(`/api/threads/${thread._id}/learn`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ window: 400 }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (d.created) toast.success(`found ${d.created} things worth remembering`, { description: "check them in Review", action: { label: "Review", onClick: () => router.push("/review") } });
      else toast("nothing new worth remembering in there");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(null);
    }
  }

  async function voice(mode: "personal" | "affectionate" | "professional" | "creative") {
    setMenu(false);
    setBusy("voice");
    try {
      const r = await fetch(`/api/threads/${thread._id}/voice`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, count: 24 }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      toast.success(`${d.added} of your texts added to your ${mode} voice`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setMenu(false);
    const typed = prompt(`delete "${thread.title}", all ${thread.messageCount} messages and its photos? voice samples from it go too. type "delete" to confirm.`);
    if (typed?.trim().toLowerCase() !== "delete") return;
    const r = await fetch(`/api/threads/${thread._id}`, { method: "DELETE", headers: { "x-confirm-delete": "yes" } });
    if (r.ok) {
      toast.success("chat wiped from your brain");
      router.push("/chats");
      router.refresh();
    }
  }

  const visible = useMemo(() => {
    if (!q) return messages;
    const n = q.toLowerCase();
    return messages.filter((m) => m.text.toLowerCase().includes(n) || m.media?.description?.toLowerCase().includes(n));
  }, [messages, q]);
  const others = thread.participants.filter((p) => p !== thread.selfName);
  const isPartner = thread.entityId === "person:komal";
  const perPhoto = PER_PHOTO_USD[mediaModel];
  const visualTotal = stats ? stats.photos + stats.videos : 0;

  return (
    <div className="relative flex h-dvh flex-col pt-14 lg:pt-0">
      <WallpaperLayer wp={thread.wallpaper} />

      <header className="rail relative z-20 flex items-center gap-3 border-b border-line px-3 py-2.5 md:px-5">
        <Link href="/chats" className="p-1.5 text-muted transition hover:-translate-x-0.5 hover:text-fg" aria-label="All chats">
          <ArrowLeft className="size-5" />
        </Link>
        <SourceIcon source={thread.source} className="size-8" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[18px] font-bold leading-tight tracking-tight">{thread.title}</p>
          <p className="truncate font-mono text-[10.5px] text-faint">
            {others.join(", ") || "just you"} · {thread.messageCount.toLocaleString()} msgs{visualTotal ? ` · ${visualTotal.toLocaleString()} photos` : ""}
          </p>
        </div>
        {searching ? (
          <div className="flex items-center gap-1 border-b border-accent-line pl-1">
            <Search className="size-4 text-accent" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="search texts & photos" className="h-8 w-36 bg-transparent text-sm outline-none placeholder:text-faint md:w-56" />
            <button
              onClick={() => {
                setSearching(false);
                setQ("");
              }}
              className="p-1.5 text-faint hover:text-fg"
              aria-label="Close search"
            >
              <X className="size-4" />
            </button>
          </div>
        ) : (
          <button onClick={() => setSearching(true)} className="p-1.5 text-muted transition hover:-rotate-6 hover:text-fg" aria-label="Search">
            <Search className="size-[18px]" />
          </button>
        )}
        <Link href={`/?thread=${thread._id}&mode=assistant`} className="hidden items-center gap-1.5 rounded-full bg-grad px-3.5 py-1.5 text-xs font-semibold text-accent-ink transition hover:brightness-110 sm:inline-flex">
          <Sparkles className="size-3.5" /> ask about this chat
        </Link>
        <WallpaperPicker value={thread.wallpaper} onChange={(wp) => patch({ wallpaper: wp })} />
        <div className="relative" ref={menuRef}>
          <button onClick={() => setMenu(!menu)} className="p-1.5 text-muted transition hover:text-fg" aria-label="More">
            {busy ? <Loader2 className="size-[18px] animate-spin" /> : <MoreHorizontal className="size-[18px]" />}
          </button>
          {menu && (
            <MenuSheet className="absolute right-0 top-11 w-72">
              <MenuLabel>this chat</MenuLabel>
              <Link href={`/?thread=${thread._id}&mode=assistant`} className="group flex items-center gap-3 rounded-xl px-3 py-2 text-[13.5px] text-muted transition hover:bg-panel-2 hover:text-fg sm:hidden">
                <Sparkles className="size-4 text-faint transition-transform group-hover:-rotate-6 group-hover:text-accent" /> ask about this chat
              </Link>
              {stats && stats.pending > 0 && (
                <MenuItem icon={Eye} onClick={describePhotos} disabled={analyzing}>
                  describe {stats.pending.toLocaleString()} photos
                </MenuItem>
              )}
              <MenuItem icon={Brain} onClick={learn} disabled={!thread.selfName}>
                learn from the latest 400
              </MenuItem>
              <MenuDivider />
              <MenuLabel>teach my voice from my texts</MenuLabel>
              {(isPartner ? (["affectionate", "personal"] as const) : (["personal", "professional", "affectionate", "creative"] as const)).map((m) => (
                <MenuItem key={m} icon={AudioLines} onClick={() => voice(m)} disabled={!thread.selfName}>
                  as {m}
                </MenuItem>
              ))}
              <MenuDivider />
              <MenuItem icon={Trash2} danger onClick={remove}>
                delete chat & photos
              </MenuItem>
            </MenuSheet>
          )}
        </div>
      </header>

      {!thread.selfName && (
        <div className="rail relative z-10 flex flex-wrap items-center gap-3 border-b border-dashed border-line-strong px-5 py-2.5 text-sm">
          <Wand2 className="size-4 text-accent" /> which one is you?
          {thread.participants.map((p) => (
            <button key={p} onClick={() => patch({ selfName: p })} className="text-muted underline decoration-dashed underline-offset-4 hover:text-accent">
              {p}
            </button>
          ))}
        </div>
      )}

      {stats && visualTotal > 0 && (stats.pending > 0 || analyzing || stats.failed > 0) && (
        <div className="rail relative z-10 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-dashed border-line-strong px-5 py-2.5 text-sm">
          <Eye className="size-4 text-accent" />
          <span className="text-muted">
            <strong className="text-fg">{stats.done.toLocaleString()}</strong> of {visualTotal.toLocaleString()} photos described
            {stats.failed ? <span className="text-warn"> · {stats.failed} failed</span> : null}
          </span>
          {analyzing ? (
            <>
              <span className="h-1 w-32 overflow-hidden rounded-full bg-panel-2">
                <span className="block h-full bg-grad transition-all" style={{ width: `${(stats.done / Math.max(1, visualTotal)) * 100}%` }} />
              </span>
              <button onClick={() => (stopRef.current = true)} className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
                <Pause className="size-3.5" /> pause
              </button>
            </>
          ) : (
            <>
              {stats.pending > 0 && (
                <Button size="sm" variant="primary" onClick={describePhotos}>
                  <Eye /> describe {stats.pending.toLocaleString()} photos
                </Button>
              )}
              {stats.failed > 0 && (
                <button onClick={retryFailed} className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
                  <RotateCcw className="size-3.5" /> retry failed
                </button>
              )}
              <span className="font-mono text-[10.5px] text-faint">
                {mediaModel}
                {perPhoto ? ` · ~$${(perPhoto * stats.pending).toFixed(perPhoto * stats.pending < 1 ? 2 : 0)} total` : ""}
              </span>
            </>
          )}
        </div>
      )}

      <div ref={scroller} className="relative z-10 flex-1 overflow-y-auto px-3 pb-6 md:px-8">
        <div className="mx-auto max-w-3xl">
          {hasMore && !q && (
            <div className="flex justify-center py-4">
              <Button size="sm" onClick={loadEarlier} disabled={loadingMore}>
                {loadingMore ? <Loader2 className="animate-spin" /> : <ChevronDown className="rotate-180" />} load earlier
              </Button>
            </div>
          )}
          {q && <p className="py-3 text-center font-mono text-[11px] text-muted">{`// ${visible.length} matches in loaded messages`}</p>}
          {visible.map((m, i) => {
            const prev = visible[i - 1];
            const newDay = !prev || new Date(prev.at).toDateString() !== new Date(m.at).toDateString();
            const grouped = prev && !newDay && prev.sender === m.sender && prev.kind !== "system";
            return (
              <div key={m._id}>
                {newDay && (
                  <div className="sticky top-2 z-10 my-4 flex justify-center">
                    <span className="rounded-full border border-line bg-panel-solid/90 px-3 py-1 font-mono text-[10.5px] text-muted backdrop-blur">{dayLabel(m.at)}</span>
                  </div>
                )}
                {m.kind === "system" ? (
                  <p className="mx-auto my-2 max-w-md rounded-xl bg-panel-solid/70 px-3 py-1.5 text-center text-[11px] text-muted">{m.text}</p>
                ) : (
                  <div className={cn("flex", m.isSelf ? "justify-end" : "justify-start", grouped ? "mt-0.5" : "mt-3")}>
                    <div
                      className={cn(
                        "max-w-[78%] px-3.5 py-2 text-[14.5px] leading-relaxed shadow-sm",
                        m.isSelf ? "rounded-[20px] rounded-br-md bg-grad text-accent-ink" : "rounded-[20px] rounded-bl-md border border-line bg-panel-solid/90 text-fg",
                      )}
                    >
                      {!m.isSelf && !grouped && others.length > 1 && <p className="mb-0.5 text-[11px] font-semibold text-accent">{m.sender}</p>}
                      {m.kind === "deleted" ? (
                        <span className="inline-flex items-center gap-1.5 opacity-75">
                          <Ban className="size-3.5" /> message deleted
                        </span>
                      ) : m.kind === "media" ? (
                        <MediaBody m={m} q={q} onOpen={setLightbox} />
                      ) : (
                        <p className="whitespace-pre-wrap break-words">
                          <Highlight text={m.text} q={q} />
                        </p>
                      )}
                      <p className={cn("mt-0.5 text-right text-[10px]", m.isSelf ? "text-accent-ink/60" : "text-faint")}>
                        {m.edited && "edited · "}
                        {time(m.at)}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {lightbox?.media && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/85 p-4 backdrop-blur-sm" onClick={() => setLightbox(null)}>
          <figure className="sheet relative max-w-3xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/media/${lightbox.media.id}`} alt={lightbox.media.description ?? "photo"} className="max-h-[70vh] w-full object-contain" />
            <figcaption className="dashed-top space-y-2 p-4 text-sm">
              <p className="font-mono text-[10.5px] text-faint">{`// ${lightbox.isSelf ? "you" : lightbox.sender} · ${dayLabel(lightbox.at)} · ${time(lightbox.at)}`}</p>
              {lightbox.media.description ? (
                <p className="text-muted">{lightbox.media.description}</p>
              ) : (
                <p className="text-faint">not described yet. hit &quot;describe photos&quot; up top.</p>
              )}
              {lightbox.media.visibleText && <p className="text-xs text-faint">text in it: “{lightbox.media.visibleText}”</p>}
              {lightbox.media.tags.length > 0 && (
                <p className="flex flex-wrap gap-x-3 font-mono text-[10.5px] text-accent">
                  {lightbox.media.tags.map((t) => (
                    <span key={t}>#{t}</span>
                  ))}
                </p>
              )}
            </figcaption>
            <button onClick={() => setLightbox(null)} className="absolute right-3 top-3 rounded-full bg-black/60 p-1.5 text-white transition hover:rotate-90" aria-label="Close">
              <X className="size-4" />
            </button>
          </figure>
        </div>
      )}
    </div>
  );
}
