"use client";

import {
  ArrowUp,
  AudioLines,
  Brain,
  Briefcase,
  Cake,
  CalendarClock,
  Camera,
  ChevronDown,
  Clapperboard,
  Dumbbell,
  Eye,
  EyeOff,
  Flame,
  Gift,
  Handshake,
  HandHeart,
  Heart,
  History,
  Hourglass,
  Inbox,
  Keyboard,
  Layers,
  Loader2,
  Mail,
  Megaphone,
  MessageCircle,
  MessagesSquare,
  MicVocal,
  Moon,
  PartyPopper,
  Plus,
  Receipt,
  Repeat,
  ShieldCheck,
  Trash2,
  TrendingUp,
  Wand2,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { SECTION_LABEL, type ChatCitation, type ChatMessage, type Nudge, type PersonaMode, type Wallpaper } from "@/lib/domain";
import { SourceIcon } from "@/components/source-icon";
import { Badge, Orb, SquiggleTab } from "@/components/ui";
import { WallpaperLayer, WallpaperPicker } from "@/components/wallpaper";
import { cn, formatWhen } from "@/lib/utils";

const MODES: { id: PersonaMode; icon: LucideIcon; label: string; hint: string }[] = [
  { id: "assistant", icon: Brain, label: "brain", hint: "your candid second brain, answers from memory" },
  { id: "personal", icon: MessageCircle, label: "me, casual", hint: "drafts in your everyday texting voice" },
  { id: "professional", icon: Briefcase, label: "me, pro", hint: "clean founder voice, no emoji spam" },
  { id: "affectionate", icon: Heart, label: "me, warm", hint: "sincere and personal, never cringe" },
  { id: "creative", icon: MicVocal, label: "creative", hint: "bars, captions, wordplay co-writer" },
];

const SUGGESTIONS: Record<PersonaMode, { icon: LucideIcon; text: string }[]> = {
  assistant: [
    { icon: TrendingUp, text: "zaptick MRR rn?" },
    { icon: Layers, text: "what am I juggling rn? be brutal" },
    { icon: Keyboard, text: "why did I even start Racket" },
    { icon: Dumbbell, text: "how is the 90 day comeback supposed to go" },
  ],
  personal: [
    { icon: PartyPopper, text: "tell the gang I am out tonight, next weekend pakka" },
    { icon: Cake, text: "bday wish for Anushka, short and funny" },
    { icon: Flame, text: "roast Shubhodeep for being late (lightly)" },
    { icon: CalendarClock, text: "reschedule a call without sounding flaky" },
  ],
  professional: [
    { icon: Mail, text: "cold email for Zaptick to a D2C brand" },
    { icon: Megaphone, text: "LinkedIn post on the ILH showcase" },
    { icon: Handshake, text: "follow up with a lead who ghosted" },
    { icon: Receipt, text: "payment reminder, polite but firm" },
  ],
  affectionate: [
    { icon: Moon, text: "goodnight text for Komal, not cheesy" },
    { icon: Gift, text: "gift ideas for Komal that are not generic" },
    { icon: HandHeart, text: "something sweet for the 16th, in my words" },
    { icon: Heart, text: "say sorry about Diwali properly" },
  ],
  creative: [
    { icon: MicVocal, text: "16 bars, multis, about building at 3am" },
    { icon: Camera, text: "5 IG captions, low light high standards energy" },
    { icon: Repeat, text: "rhyme chain off the word deploy" },
    { icon: Clapperboard, text: "reel hooks for a Zaptick BTS" },
  ],
};

const NUDGE_ICON: Record<Nudge["icon"], LucideIcon> = {
  calendar: CalendarClock,
  hourglass: Hourglass,
  review: ShieldCheck,
  voice: AudioLines,
  chats: MessagesSquare,
  seed: Inbox,
};

type UiMessage = ChatMessage & { pending?: boolean; evidence?: ChatCitation[]; strategy?: string[]; error?: string };
type ConvoSummary = { _id: string; title: string; updatedAt: string; mode: PersonaMode; channel?: "text" | "voice" | "whatsapp" };
type ThreadInfo = { _id: string; title: string; source: "whatsapp" | "instagram" | "chatgpt" } | null;

function CitationChip({ c }: { c: ChatCitation | undefined }) {
  const [open, setOpen] = useState(false);
  if (!c) return null;
  return (
    <span className="relative inline-block align-baseline" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <Link href={`/vault/${encodeURIComponent(c.id)}`} className="mx-0.5 inline-flex h-[18px] items-center rounded-full bg-accent-soft px-1.5 font-mono text-[10px] font-semibold text-accent no-underline hover:brightness-125">
        {c.label}
      </Link>
      {open && (
        <span className="absolute bottom-full left-1/2 z-30 mb-2 w-72 -translate-x-1/2 rounded-2xl border border-line-strong bg-panel-solid p-3 text-left text-xs leading-relaxed text-muted shadow-2xl animate-pop">
          <span className="mb-1.5 flex flex-wrap gap-1">
            <Badge>{SECTION_LABEL[c.section]}</Badge>
            <Badge tone={c.reviewStatus === "accepted" ? "ok" : "warn"}>{c.reviewStatus === "accepted" ? "confirmed" : "unverified"}</Badge>
            {c.temporal === "snapshot" && <Badge tone="info">as of {formatWhen(c.when)}</Badge>}
          </span>
          <span className="block text-fg">{c.sensitivity === "sensitive" ? "sensitive memory, click to open" : c.statement}</span>
          <span className="mt-1.5 block font-mono text-[10px] text-faint">{c.sourceLabel}</span>
        </span>
      )}
    </span>
  );
}

function AssistantBody({ msg }: { msg: UiMessage }) {
  const cites = msg.citations ?? msg.evidence ?? [];
  const byLabel = new Map(cites.map((c) => [c.label, c]));
  const text = msg.content.replace(/\[(M\d+(?:\s*,\s*M\d+)*)\]/g, (_, g: string) =>
    g
      .split(",")
      .map((l) => `[${l.trim()}](#cite:${l.trim()})`)
      .join(""),
  );
  return (
    <div className="prose-brain">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) =>
            href?.startsWith("#cite:") ? (
              <CitationChip c={byLabel.get(href.slice(6))} />
            ) : (
              <a href={href} target="_blank" rel="noreferrer noopener">
                {children}
              </a>
            ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

function Sources({ msg }: { msg: UiMessage }) {
  const [open, setOpen] = useState(false);
  const cited = msg.citations ?? [];
  const retrieved = msg.evidence ?? [];
  const list = cited.length ? cited : retrieved;
  if (!list.length && !msg.strategy?.length) return null;
  return (
    <div className="mt-2.5">
      <button onClick={() => setOpen(!open)} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] text-faint hover:bg-panel-2 hover:text-muted">
        <ChevronDown className={cn("size-3 transition", open && "rotate-180")} />
        {cited.length ? `used ${cited.length} memories` : `checked ${retrieved.length} memories`}
      </button>
      {open && (
        <ul className="mt-2 space-y-1.5 rounded-2xl bg-panel-2/60 p-3 animate-pop">
          {list.map((c) => (
            <li key={c.id} className="text-xs leading-relaxed">
              <Link href={`/vault/${encodeURIComponent(c.id)}`} className="text-muted hover:text-fg">
                <span className="mr-1.5 font-mono font-semibold text-accent">{c.label}</span>
                {c.sensitivity === "sensitive" ? <span className="text-faint">sensitive memory, open to view</span> : c.statement}
              </Link>
              <span className="ml-1.5 font-mono text-[10px] text-faint">{formatWhen(c.when)}</span>
            </li>
          ))}
          {msg.strategy && <li className="pt-1 font-mono text-[10px] text-faint">retrieval → {msg.strategy.join(" | ")}</li>}
        </ul>
      )}
    </div>
  );
}

export function Chat({
  conversations,
  initial,
  initialQuery,
  initialMode,
  thread: initialThread,
  configured,
  model,
  greeting,
  nudges,
}: {
  conversations: ConvoSummary[];
  initial: { _id: string; mode: PersonaMode; messages: ChatMessage[]; wallpaper?: Wallpaper; thread: ThreadInfo } | null;
  initialQuery: string | null;
  initialMode: PersonaMode;
  thread: ThreadInfo;
  configured: boolean;
  model: string;
  greeting: { title: string; sub: string };
  nudges: Nudge[];
}) {
  const router = useRouter();
  const [convoId, setConvoId] = useState<string | null>(initial?._id ?? null);
  const [messages, setMessages] = useState<UiMessage[]>(initial?.messages ?? []);
  const [mode, setMode] = useState<PersonaMode>(initial?.mode ?? initialMode);
  const [thread, setThread] = useState<ThreadInfo>(initial?.thread ?? initialThread);
  const [wallpaper, setWallpaper] = useState<Wallpaper | undefined>(initial?.wallpaper);
  const [includeSensitive, setIncludeSensitive] = useState(true);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [learning, setLearning] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const autoSent = useRef(false);
  const pendingWallpaper = useRef<Wallpaper | null>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const t = textarea.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = `${Math.min(t.scrollHeight, 200)}px`;
  }, [input]);

  async function saveWallpaper(wp: Wallpaper) {
    setWallpaper(wp);
    if (!convoId) {
      pendingWallpaper.current = wp;
      return;
    }
    await fetch(`/api/conversations/${convoId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallpaper: wp }) });
  }

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    setBusy(true);
    setInput("");
    const now = new Date().toISOString();
    const draft: UiMessage = { id: `a${now}`, role: "assistant", content: "", at: now, pending: true };
    setMessages((m) => [...m, { id: `u${now}`, role: "user", content, at: now }, draft]);
    const patch = (fn: (m: UiMessage) => UiMessage) => setMessages((all) => all.map((m) => (m.id === draft.id ? fn(m) : m)));

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: convoId, threadId: convoId ? undefined : thread?._id, message: content, mode, includeSensitive }),
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(err.error ?? "Request failed");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let evidence: ChatCitation[] = [];
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const ev = JSON.parse(line);
          if (ev.type === "meta") {
            evidence = ev.evidence;
            if (!convoId) {
              setConvoId(ev.conversationId);
              window.history.replaceState(null, "", `/?c=${ev.conversationId}`);
              if (pendingWallpaper.current) {
                void fetch(`/api/conversations/${ev.conversationId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallpaper: pendingWallpaper.current }) });
                pendingWallpaper.current = null;
              }
            }
            patch((m) => ({ ...m, evidence, strategy: ev.strategy }));
          } else if (ev.type === "actions") {
            const n = (ev.tasks as { title: string }[]).length;
            toast.success(n === 1 ? `added to todos: ${(ev.tasks as { title: string }[])[0].title}` : `added ${n} todos`, { action: { label: "open", onClick: () => router.push("/todos") } });
          } else if (ev.type === "text") patch((m) => ({ ...m, content: m.content + ev.delta }));
          else if (ev.type === "done") patch((m) => ({ ...m, pending: false, citations: evidence.filter((c) => ev.cited.includes(c.id)) }));
          else if (ev.type === "error") patch((m) => ({ ...m, pending: false, error: ev.message }));
        }
      }
      patch((m) => ({ ...m, pending: false }));
      router.refresh();
    } catch (err) {
      patch((m) => ({ ...m, pending: false, error: err instanceof Error ? err.message : "Failed" }));
    } finally {
      setBusy(false);
      textarea.current?.focus();
    }
  }

  useEffect(() => {
    if (initialQuery && !autoSent.current && !initial) {
      autoSent.current = true;
      void send(initialQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function learn() {
    if (!convoId) return;
    setLearning(true);
    try {
      const res = await fetch("/api/extract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId: convoId }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      if (data.created > 0) {
        toast.success(`${data.created} new thing${data.created === 1 ? "" : "s"} worth remembering`, { description: "nothing gets saved till you say yes.", action: { label: "Review", onClick: () => router.push("/review") } });
        router.refresh();
      } else toast("nothing new worth remembering here");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Extraction failed");
    } finally {
      setLearning(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("delete this chat for good?")) return;
    const res = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("chat deleted");
      if (id === convoId) newChat();
      router.refresh();
    }
  }

  function newChat() {
    setConvoId(null);
    setMessages([]);
    setThread(null);
    setWallpaper(undefined);
    window.history.replaceState(null, "", "/");
    textarea.current?.focus();
  }

  const active = MODES.find((m) => m.id === mode)!;
  const empty = messages.length === 0;

  const history = (
    <div className="flex h-full flex-col gap-1 p-3">
      <button onClick={newChat} className="mb-2 flex items-center gap-2 rounded-2xl bg-grad px-4 py-2.5 text-sm font-semibold text-accent-ink transition hover:brightness-110">
        <Plus className="size-4" /> new chat
      </button>
      <p className="px-2 pb-1 pt-2 text-[10.5px] font-medium uppercase tracking-[0.14em] text-faint">recent</p>
      <div className="flex-1 space-y-0.5 overflow-y-auto">
        {conversations.length === 0 && <p className="px-2 text-xs text-faint">no chats yet, say hi</p>}
        {conversations.map((c) => (
          <div key={c._id} className={cn("group flex items-center rounded-xl pr-1 transition", c._id === convoId ? "bg-panel-2" : "hover:bg-panel-2/60")}>
            <a href={`/?c=${c._id}`} className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-[13px] text-muted hover:text-fg">
              {c.channel === "whatsapp" ? <SourceIcon source="whatsapp" className="size-3.5 shrink-0" /> : c.channel === "voice" ? <AudioLines className="size-3.5 shrink-0 text-accent" aria-label="voice session" /> : (() => { const I = MODES.find((m) => m.id === c.mode)?.icon ?? Brain; return <I className="size-3.5 shrink-0 text-faint" />; })()}
              <span className="truncate">{c.title}</span>
            </a>
            <button onClick={() => remove(c._id)} className="hidden rounded-lg p-1 text-faint hover:text-danger group-hover:block" aria-label="Delete chat">
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="relative flex h-dvh pt-14 lg:pt-0">
      <aside className="relative z-10 hidden w-64 shrink-0 border-r border-line bg-elev/40 xl:block">{history}</aside>
      {historyOpen && (
        <div className="fixed inset-0 z-40 xl:hidden" onClick={() => setHistoryOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <aside className="glass absolute inset-y-3 left-3 w-72 rounded-3xl bg-panel-solid/95 animate-pop" onClick={(e) => e.stopPropagation()}>
            {history}
          </aside>
        </div>
      )}

      <section className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <WallpaperLayer wp={wallpaper} />

        {/* top bar */}
        <div className="rail relative z-20 flex items-center gap-3 border-b border-line px-3 py-2 md:px-5">
          <button onClick={() => setHistoryOpen(true)} className="p-1.5 text-muted hover:text-fg xl:hidden" aria-label="Chat history">
            <History className="size-4" />
          </button>
          <div className="flex items-center gap-5 overflow-x-auto pb-1 pt-0.5">
            {MODES.map((m) => (
              <SquiggleTab key={m.id} active={mode === m.id} icon={m.icon} onClick={() => setMode(m.id)} title={m.hint}>
                <span className={cn(mode !== m.id && "hidden md:inline")}>{m.label}</span>
              </SquiggleTab>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-1">
            {thread && (
              <span className="hidden items-center gap-2 border-r border-dashed border-line-strong pr-3 text-xs md:inline-flex">
                <SourceIcon source={thread.source} className="size-5" />
                <Link href={`/chats/${thread._id}`} className="max-w-32 truncate hover:text-accent">
                  {thread.title}
                </Link>
                {!convoId && (
                  <button onClick={() => setThread(null)} className="text-faint hover:text-fg" aria-label="Stop using this chat">
                    <X className="size-3.5" />
                  </button>
                )}
              </span>
            )}
            <div className="flex items-center">
              <button
                onClick={() => setIncludeSensitive(!includeSensitive)}
                className="group inline-flex h-9 items-center gap-1.5 px-2 text-xs text-muted hover:text-fg"
                title="whether sensitive memories (health, relationships, family) can be used and sent to Claude"
              >
                {includeSensitive ? <Eye className="size-[18px] transition-transform group-hover:-rotate-12" /> : <EyeOff className="size-[18px]" />}
              </button>
              <WallpaperPicker value={wallpaper} onChange={saveWallpaper} />
              {convoId && messages.length > 1 && (
                <button onClick={learn} disabled={learning || busy || !configured} title="remember things you said here (you approve each one)" className="group inline-flex h-9 items-center gap-1.5 px-2 text-xs text-muted hover:text-fg disabled:opacity-40">
                  {learning ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
                  <span className="hidden lg:inline">learn</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* messages */}
        <div ref={scroller} className="relative z-10 min-h-0 flex-1 overflow-y-auto px-4 md:px-8">
          {empty ? (
            <div className="mx-auto flex min-h-full max-w-2xl flex-col justify-center py-10">
              <Orb className="mb-8 size-16 animate-float" />
              <h1 className="font-display text-4xl font-bold leading-[1.05] tracking-[-0.04em] md:text-6xl">
                {thread ? (
                  <>
                    ask me anything about <span className="text-grad">{thread.title}</span>
                  </>
                ) : (
                  <>
                    {greeting.title.split(",")[0]},
                    <br />
                    <span className="text-grad">{greeting.title.split(",").slice(1).join(",").trim() || "what's up?"}</span>
                  </>
                )}
              </h1>
              <p className="mt-4 max-w-md text-[15px] text-muted">{thread ? "I'll search that chat plus everything else I remember about you." : greeting.sub}</p>
              {!configured && <p className="mt-4 rounded-2xl border border-warn/30 bg-warn/10 p-3 text-xs text-warn">no model key set, so I can&apos;t reply yet. add OPENAI_API_KEY or ANTHROPIC_API_KEY.</p>}
              {!thread && nudges.length > 0 && (
                <div className="mt-7">
                  <p className="mb-2 font-mono text-[10.5px] text-faint">{"// on my radar"}</p>
                  <ul className="space-y-1">
                    {nudges.map((n) => {
                      const Icon = NUDGE_ICON[n.icon];
                      const inner = (
                        <>
                          <Icon className="size-3.5 shrink-0 text-accent" />
                          <span className={cn("transition", n.sensitive && "blur-[4px] group-hover:blur-none")}>{n.text}</span>
                        </>
                      );
                      const cls = "group flex w-fit items-center gap-2.5 rounded-lg py-1 text-left text-sm text-muted underline-offset-4 transition hover:text-fg hover:underline decoration-accent/60";
                      return (
                        <li key={n.text}>
                          {n.href ? (
                            <Link href={n.href} className={cls}>
                              {inner}
                            </Link>
                          ) : (
                            <button
                              className={cls}
                              onClick={() => {
                                setInput(n.prompt ?? n.text);
                                textarea.current?.focus();
                              }}
                            >
                              {inner}
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              <div className="mt-8 grid gap-2.5 sm:grid-cols-2">
                {SUGGESTIONS[mode].map((s, i) => (
                  <button
                    key={s.text}
                    onClick={() => void send(s.text)}
                    className="glass group flex items-start gap-3 rounded-2xl p-4 text-left text-sm text-muted transition hover:-translate-y-0.5 hover:text-fg hover:shadow-[0_12px_40px_-16px_var(--accent)] animate-rise"
                    style={{ animationDelay: `${i * 60}ms` }}
                  >
                    <s.icon className="mt-0.5 size-4 shrink-0 text-accent transition group-hover:scale-125" />
                    <span>{s.text}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-6 py-8">
              {messages.map((m) =>
                m.role === "user" ? (
                  <div key={m.id} className="flex justify-end animate-pop">
                    <div className="max-w-[82%] whitespace-pre-wrap rounded-[22px] rounded-br-md bg-grad px-4 py-2.5 text-[15px] leading-relaxed text-accent-ink shadow-[0_10px_30px_-14px_var(--accent)]">{m.content}</div>
                  </div>
                ) : (
                  <div key={m.id} className="flex gap-3 animate-pop">
                    <Orb className="mt-1 size-7" thinking={m.pending} />
                    <div className="min-w-0 max-w-[88%] flex-1">
                      <div className="glass inline-block max-w-full rounded-[22px] rounded-tl-md bg-panel-solid/60 px-4 py-3 text-fg">
                        {m.pending && !m.content ? (
                          <span className="flex items-center gap-2 py-1 text-sm text-muted">
                            <span className="flex gap-1">
                              <span className="typing-dot" />
                              <span className="typing-dot" />
                              <span className="typing-dot" />
                            </span>
                            {m.evidence ? `thinking over ${m.evidence.length} memories` : "digging through memory"}
                          </span>
                        ) : (
                          m.content && <AssistantBody msg={m} />
                        )}
                        {m.error && <p className="mt-2 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{m.error}</p>}
                      </div>
                      {!m.pending && <Sources msg={m} />}
                    </div>
                  </div>
                ),
              )}
            </div>
          )}
        </div>

        {/* composer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
          className="relative z-20 mx-auto w-full max-w-3xl px-4 pb-4 md:pb-6"
        >
          <div className="glass flex items-end gap-2 rounded-[28px] bg-panel-solid/70 p-2 shadow-panel transition focus-within:border-accent-line focus-within:shadow-[0_0_0_4px_var(--accent-soft)]">
            <span className="grid size-10 shrink-0 place-items-center text-accent"><active.icon className="size-[18px]" /></span>
            <textarea
              ref={textarea}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              rows={1}
              placeholder={mode === "assistant" ? "ask me anything, man…" : `what should I write? (${active.label})`}
              className="max-h-[200px] min-h-10 flex-1 resize-none bg-transparent py-2.5 text-[15px] text-fg outline-none placeholder:text-faint"
            />
            {!input.trim() && !busy && (
              <Link href="/talk" aria-label="talk instead" title="talk to me" className="grid size-10 shrink-0 place-items-center rounded-full text-muted transition hover:bg-panel-2 hover:text-accent">
                <AudioLines className="size-[18px]" />
              </Link>
            )}
            <button type="submit" disabled={busy || !input.trim()} className="grid size-10 shrink-0 place-items-center rounded-full bg-grad text-accent-ink transition hover:scale-105 disabled:scale-100 disabled:opacity-30" aria-label="Send">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-5" />}
            </button>
          </div>
          <p className="mt-2 text-center text-[10.5px] text-faint">
            {model} · only what this answer needs goes to the model · I never send anything on your behalf
          </p>
        </form>
      </section>
    </div>
  );
}
