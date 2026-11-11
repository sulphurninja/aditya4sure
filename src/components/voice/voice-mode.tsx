"use client";

import { AudioLines, ChevronDown, Ear, EarOff, History, Loader2, Mic, Moon, Plus, SlidersHorizontal, Volume2, VolumeX, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { VoiceOrb, type OrbState } from "./voice-orb";
import { VoicePicker } from "./voice-picker";
import { chime, SLEEP, WAKE, WakeListener, wakeSupported } from "./wake";

type Status = { enabled: boolean; usage: { month: string; ttsChars: number; sttMinutes: number; charCap: number; sttMinuteCap: number }; quota: { used: number; limit: number; resetsAt: string | null } | null };
type Phase = "idle" | "listening" | "transcribing" | "thinking" | "speaking" | "error";

const MAX_MS = 45_000;
const SILENCE_MS = 1300;
/** Quietly restart an empty recording this often (nothing is sent anywhere when you're silent). */
const RESTART_MS = 15_000;
/** Awake with nothing said for this long = back to sleep (standby). */
const IDLE_SLEEP_MS = 60_000;
const noop = () => () => {};

/** Bridge exposed by the Electron desktop app (desktop/preload.js). */
type DesktopBridge = { isDesktop: true; onWake: (cb: () => void) => () => void; show: () => void; hide: () => void };
function desktop(): DesktopBridge | null {
  return typeof window !== "undefined" ? ((window as unknown as { adityaDesktop?: DesktopBridge }).adityaDesktop ?? null) : null;
}
const isDesktopSnapshot = () => Boolean(desktop());

function pickMime() {
  if (typeof MediaRecorder === "undefined") return "";
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) if (MediaRecorder.isTypeSupported(m)) return m;
  return "";
}

/** For the voice: drop citation tags, keep emotion tags like [laughs] (the TTS model performs them). */
function clean(text: string) {
  return text.replace(/\s*\[(M\d+(?:\s*,\s*M\d+)*)\]/g, "");
}

/** For the screen: no citation tags, no emotion tags. */
function screen(text: string) {
  return clean(text)
    .replace(/\[[a-z][a-z ]{1,24}\]\s*/gi, "")
    .replace(/\s{2,}/g, " ");
}

const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));

export type VoiceTurn = { role: "user" | "assistant"; content: string };
export type VoiceSession = { id: string; title: string; updatedAt: string; turns: number };

function ago(iso: string) {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" }).toLowerCase();
}

export function VoiceMode({
  initialStatus,
  session,
  sessions,
}: {
  initialStatus: Status;
  session: { id: string; title: string; updatedAt: string; messages: VoiceTurn[] } | null;
  sessions: VoiceSession[];
}) {
  const [status, setStatus] = useState(initialStatus);
  const [history, setHistory] = useState<VoiceTurn[]>(() => session?.messages ?? []);
  const [sessionTitle, setSessionTitle] = useState(session?.title ?? null);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const transcriptEnd = useRef<HTMLDivElement | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [heard, setHeard] = useState("");
  const [reply, setReply] = useState("");
  const heardRef = useRef("");
  const replyRef = useRef("");
  useEffect(() => {
    heardRef.current = heard;
    replyRef.current = reply;
  }, [heard, reply]);
  useEffect(() => {
    transcriptEnd.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [history.length, heard, reply]);
  /** awake = in a conversation, listens again after every reply. asleep = waits for the wake phrase. */
  const [awake, setAwake] = useState(false);
  const [armed, setArmed] = useState(false);
  const isDesktop = useSyncExternalStore(noop, isDesktopSnapshot, () => false);
  const canWake = useSyncExternalStore(noop, wakeSupported, () => false) && !isDesktop;
  const [wakeOn, setWakeOn] = useState(true);
  const [muted, setMuted] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const level = useRef(0);

  const ctxRef = useRef<AudioContext | null>(null);
  const micStream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const audioEl = useRef<HTMLAudioElement | null>(null);
  const outAnalyser = useRef<AnalyserNode | null>(null);
  const queue = useRef<Promise<string | null>[]>([]);
  const playing = useRef(false);
  const streamDone = useRef(true);
  const convoId = useRef<string | null>(session?.id ?? null);
  const abortChat = useRef<AbortController | null>(null);
  const loopRaf = useRef(0);
  const phaseRef = useRef<Phase>("idle");
  const awakeRef = useRef(false);
  const wakeOnRef = useRef(true);
  const lastActive = useRef(0);
  const sleepAfterTurn = useRef(false);
  const wakeRef = useRef<WakeListener | null>(null);
  const sleepRef = useRef<() => void>(() => {});
  const wakeUpRef = useRef<(rest: string) => void>(() => {});
  const mutedRef = useRef(muted);
  const listenRef = useRef<() => void>(() => {});

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    mutedRef.current = muted;
    wakeOnRef.current = wakeOn;
  }, [muted, wakeOn]);

  const refreshStatus = useCallback(async () => {
    try {
      const r = await fetch("/api/voice/status", { cache: "no-store" });
      if (r.ok) setStatus(await r.json());
    } catch {
      /* meter is best effort */
    }
  }, []);

  const audio = useCallback(() => {
    if (!ctxRef.current) {
      const ctx = new AudioContext();
      const el = new Audio();
      el.preload = "auto";
      const src = ctx.createMediaElementSource(el);
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      src.connect(an);
      an.connect(ctx.destination);
      ctxRef.current = ctx;
      audioEl.current = el;
      outAnalyser.current = an;
    }
    if (ctxRef.current.state === "suspended") void ctxRef.current.resume();
    return ctxRef.current;
  }, []);

  /** Loudness 0..1 from an analyser, fed to the orb every frame. */
  const watch = useCallback((an: AnalyserNode, onFrame?: (rms: number) => void) => {
    cancelAnimationFrame(loopRaf.current);
    const buf = new Uint8Array(an.fftSize);
    const tick = () => {
      an.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += ((v - 128) / 128) ** 2;
      const rms = Math.sqrt(sum / buf.length);
      level.current = Math.min(1, rms * 4);
      onFrame?.(rms);
      loopRaf.current = requestAnimationFrame(tick);
    };
    tick();
  }, []);

  const stopMic = useCallback(() => {
    micStream.current?.getTracks().forEach((t) => t.stop());
    micStream.current = null;
  }, []);

  const finishTurn = useCallback(() => {
    cancelAnimationFrame(loopRaf.current);
    level.current = 0;
    lastActive.current = Date.now();
    if (sleepAfterTurn.current) {
      sleepAfterTurn.current = false;
      sleepRef.current();
    } else if (awakeRef.current && phaseRef.current !== "error") {
      setTimeout(() => listenRef.current(), 200);
    } else setPhase("idle");
  }, []);

  /* ---------- speaking: sentence-by-sentence queue ---------- */

  const playNext = useCallback(async () => {
    if (playing.current) return;
    const next = queue.current.shift();
    if (!next) {
      if (streamDone.current) finishTurn();
      return;
    }
    playing.current = true;
    const url = await next;
    const el = audioEl.current;
    if (!url || !el || phaseRef.current === "listening") {
      playing.current = false;
      if (url) URL.revokeObjectURL(url);
      void playNext();
      return;
    }
    setPhase("speaking");
    if (outAnalyser.current) watch(outAnalyser.current);
    el.src = url;
    el.onended = () => {
      URL.revokeObjectURL(url);
      playing.current = false;
      void playNext();
    };
    try {
      await el.play();
    } catch {
      playing.current = false;
      void playNext();
    }
  }, [finishTurn, watch]);

  const say = useCallback(
    (sentence: string) => {
      if (mutedRef.current || !sentence.trim()) return;
      queue.current.push(
        fetch("/api/voice/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: sentence }) }).then(async (r) => {
          if (!r.ok) {
            const j = await r.json().catch(() => ({}));
            toast.error((j as { error?: string }).error ?? "voice failed");
            if (r.status === 402) setMuted(true);
            return null;
          }
          return URL.createObjectURL(await r.blob());
        }),
      );
      void playNext();
    },
    [playNext],
  );

  const silence = useCallback(() => {
    abortChat.current?.abort();
    queue.current = [];
    playing.current = false;
    streamDone.current = true;
    if (audioEl.current) {
      audioEl.current.pause();
      audioEl.current.removeAttribute("src");
    }
  }, []);

  /* ---------- thinking: stream the brain's answer ---------- */

  const ask = useCallback(
    async (text: string) => {
      setPhase("thinking");
      setReply("");
      streamDone.current = false;
      const ac = new AbortController();
      abortChat.current = ac;
      let full = "";
      let pending = "";
      const flush = (force = false) => {
        // Cut on sentence ends; tiny fragments wait so we don't pay per "ok."
        for (;;) {
          const m = /[.!?…](\s|$)|\n+/.exec(pending);
          if (!m) break;
          const end = m.index + m[0].length;
          if (end < 14 && !force && pending.length < 200) {
            const nextM = /[.!?…](\s|$)|\n+/.exec(pending.slice(end));
            if (!nextM) break;
          }
          say(clean(pending.slice(0, end)));
          pending = pending.slice(end);
        }
        if (force && pending.trim()) {
          say(clean(pending));
          pending = "";
        }
      };
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, mode: "assistant", conversationId: convoId.current, voice: true }),
          signal: ac.signal,
        });
        if (!res.ok || !res.body) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "brain didn't answer");
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let nl;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl);
            buf = buf.slice(nl + 1);
            if (!line.trim()) continue;
            const ev = JSON.parse(line) as { type: string; delta?: string; conversationId?: string; message?: string; tasks?: { title: string }[] };
            if (ev.type === "meta" && ev.conversationId && ev.conversationId !== convoId.current) {
              convoId.current = ev.conversationId;
              // Keep the session in the URL so a refresh or coming back resumes it.
              window.history.replaceState(null, "", `/talk?c=${ev.conversationId}`);
              setSessionTitle((t) => t ?? text.slice(0, 80));
            }
            if (ev.type === "text" && ev.delta) {
              full += ev.delta;
              pending += ev.delta;
              setReply(screen(full));
              flush();
            }
            if (ev.type === "actions" && ev.tasks?.length) toast.success(ev.tasks.length === 1 ? `added to todos: ${ev.tasks[0].title}` : `added ${ev.tasks.length} todos`);
            if (ev.type === "error") throw new Error(ev.message ?? "something broke");
          }
        }
        flush(true);
        streamDone.current = true;
        if (mutedRef.current || (!queue.current.length && !playing.current)) finishTurn();
        else void playNext();
        void refreshStatus();
      } catch (err) {
        streamDone.current = true;
        if ((err as Error).name === "AbortError") return;
        toast.error(err instanceof Error ? err.message : "failed");
        setPhase("idle");
      }
    },
    [finishTurn, playNext, refreshStatus, say],
  );

  /* ---------- listening ---------- */

  const listen = useCallback(async () => {
    if (!status.enabled) return;
    silence();
    const ctx = audio();
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      toast.error(
        name === "NotAllowedError" || name === "SecurityError"
          ? "the browser said no to the mic. click the lock icon in the address bar and allow microphone"
          : name === "NotFoundError"
            ? "no microphone found. plug one in or pick one in your system sound settings"
            : name === "NotReadableError"
              ? "mic is busy in another app (meet, zoom, discord?). close it and tap again"
              : `couldn't open the mic${name ? ` (${name})` : ""}`,
      );
      setPhase("idle");
      return;
    }
    micStream.current = stream;
    const an = ctx.createAnalyser();
    an.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(an);
    const mime = pickMime();
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    recorder.current = rec;
    const chunks: Blob[] = [];
    const started = performance.now();
    let spokeAt = 0;
    let quietSince = 0;
    let noiseFloor = 0.01;
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = async () => {
      cancelAnimationFrame(loopRaf.current);
      level.current = 0;
      stopMic();
      const secs = (performance.now() - started) / 1000;
      if (!spokeAt || phaseRef.current !== "listening") {
        if (phaseRef.current !== "listening") return;
        if (awakeRef.current && Date.now() - lastActive.current < IDLE_SLEEP_MS) setTimeout(() => listenRef.current(), 50);
        else if (awakeRef.current) sleepRef.current();
        else setPhase("idle");
        return;
      }
      lastActive.current = Date.now();
      setPhase("transcribing");
      const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
      const form = new FormData();
      form.append("audio", blob, `speech.${blob.type.includes("mp4") ? "mp4" : "webm"}`);
      form.append("seconds", String(secs));
      try {
        const r = await fetch("/api/voice/stt", { method: "POST", body: form });
        const j = (await r.json()) as { text?: string; error?: string };
        if (!r.ok) throw new Error(j.error ?? "couldn't hear that");
        const text = (j.text ?? "").trim();
        if (!text || text.length < 2) {
          if (awakeRef.current) setTimeout(() => listenRef.current(), 50);
          else setPhase("idle");
          return;
        }
        // The previous exchange moves into the scrollback before the new one starts.
        setHistory((h) => {
          const prev: VoiceTurn[] = [];
          if (heardRef.current) prev.push({ role: "user", content: heardRef.current });
          if (replyRef.current) prev.push({ role: "assistant", content: replyRef.current });
          return [...h, ...prev];
        });
        setReply("");
        setHeard(text);
        const woke = WAKE.exec(text);
        if (woke && woke.index < 3) {
          const restOfIt = text.slice(woke.index + woke[0].length).trim();
          if (restOfIt.length < 3) {
            if (awakeRef.current) setTimeout(() => listenRef.current(), 50);
            return;
          }
        }
        // "bye" / "that's all" / "go to sleep": say later and drop back to standby.
        if (SLEEP.test(text)) {
          sleepAfterTurn.current = true;
          setReply("later, I'm right here when you need me.");
          streamDone.current = true;
          if (mutedRef.current) finishTurn();
          else say("later, I'm right here when you need me.");
          return;
        }
        void ask(text);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "failed");
        setPhase("idle");
      }
    };
    rec.start(250);
    setPhase("listening");
    setReply("");
    watch(an, (rms) => {
      const now = performance.now();
      const elapsed = now - started;
      if (elapsed < 400) noiseFloor = Math.max(noiseFloor, rms * 1.4);
      const loud = rms > Math.max(0.025, noiseFloor * 1.8);
      if (loud) {
        if (!spokeAt) spokeAt = now;
        quietSince = 0;
      } else if (spokeAt && !quietSince) quietSince = now;
      const done = (spokeAt && quietSince && now - quietSince > SILENCE_MS) || elapsed > MAX_MS || (!spokeAt && elapsed > RESTART_MS);
      if (done && rec.state === "recording") rec.stop();
    });
  }, [ask, audio, finishTurn, say, silence, status.enabled, stopMic, watch]);

  useEffect(() => {
    listenRef.current = () => void listen();
  }, [listen]);

  /** Start a conversation. `rest` = whatever followed the wake phrase ("...what's on today"). */
  const wakeUp = useCallback(
    (rest: string) => {
      wakeRef.current?.stop();
      const ctx = audio();
      chime(ctx, true);
      awakeRef.current = true;
      setAwake(true);
      lastActive.current = Date.now();
      if (rest.length > 3) {
        setHistory((h) => {
          const prev: VoiceTurn[] = [];
          if (heardRef.current) prev.push({ role: "user", content: heardRef.current });
          if (replyRef.current) prev.push({ role: "assistant", content: replyRef.current });
          return [...h, ...prev];
        });
        setReply("");
        setHeard(rest);
        void ask(rest);
      } else void listen();
    },
    [ask, audio, listen],
  );

  const [standbyHeard, setStandbyHeard] = useState("");
  const startStandby = useCallback(() => {
    wakeRef.current ??= new WakeListener(
      (rest) => {
        setStandbyHeard("");
        wakeUpRef.current(rest);
      },
      (reason) => {
        toast.error(reason);
        setWakeOn(false);
      },
      (text) => setStandbyHeard(text.slice(-80)),
    );
    wakeRef.current.start();
  }, []);

  /** Standby: stop the mic, listen only for the wake phrase (if on). */
  const goToSleep = useCallback(() => {
    awakeRef.current = false;
    setAwake(false);
    if (recorder.current?.state === "recording") {
      phaseRef.current = "idle";
      recorder.current.stop();
    }
    stopMic();
    cancelAnimationFrame(loopRaf.current);
    level.current = 0;
    setPhase("idle");
    if (ctxRef.current) chime(ctxRef.current, false);
    if (wakeOnRef.current && canWake) {
      startStandby();
    }
  }, [canWake, startStandby, stopMic]);

  useEffect(() => {
    sleepRef.current = goToSleep;
    wakeUpRef.current = wakeUp;
  }, [goToSleep, wakeUp]);

  // Standby runs whenever she's asleep and the wake word is on, from the moment /talk opens.
  useEffect(() => {
    if (awake || !canWake || !status.enabled) return;
    if (wakeOn) startStandby();
    else wakeRef.current?.stop();
  }, [awake, canWake, status.enabled, wakeOn, startStandby]);

  useEffect(() => {
    const d = desktop();
    if (!d) return;
    return d.onWake(() => {
      setArmed(true);
      if (!awakeRef.current) wakeUpRef.current("");
      else if (phaseRef.current !== "listening") listenRef.current();
    });
  }, []);

  // Browsers only allow audio playback after a real click/key; the first one anywhere on the page unlocks it.
  useEffect(() => {
    if (armed) return;
    const unlock = () => {
      audio();
      setArmed(true);
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [armed, audio]);

  function newSession() {
    stopAll();
    convoId.current = null;
    setHistory([]);
    setHeard("");
    setReply("");
    setSessionTitle(null);
    setSessionsOpen(false);
    window.history.replaceState(null, "", "/talk?new=1");
  }

  const tapOrb = () => {
    if (!status.enabled) return;
    // The first tap also unlocks audio playback (browsers require one real tap per page).
    if (!armed) setArmed(true);
    if (!awake) {
      wakeUp("");
      return;
    }
    if (phase === "listening") {
      if (recorder.current?.state === "recording") recorder.current.stop();
      return;
    }
    // Tap while it's talking or thinking = interrupt and listen.
    lastActive.current = Date.now();
    void listen();
  };

  /** Esc / stop: end the conversation, go back to standby. */
  const stopAll = () => {
    silence();
    goToSleep();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        tapOrb();
      }
      if (e.key === "Escape") stopAll();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(
    () => () => {
      silence();
      stopMic();
      wakeRef.current?.stop();
      cancelAnimationFrame(loopRaf.current);
      void ctxRef.current?.close();
    },
    [silence, stopMic],
  );

  const orbState: OrbState = phase === "transcribing" ? "thinking" : phase === "error" ? "error" : phase;
  const asleepHint = isDesktop ? "ctrl+shift+space or tap me" : wakeOn && canWake ? `say "yo wassup gang" or tap me` : "tap me to talk";
  const hint = !status.enabled
    ? "add ELEVENLABS_API_KEY to .env.local to wake me up"
    : phase === "idle" && !awake
      ? asleepHint
      : { idle: "I'm listening", listening: "listening… just talk", transcribing: "got it…", thinking: "thinking…", speaking: "tap to cut me off", error: "something broke" }[phase];
  const u = status.usage;

  return (
    <div className={cn("relative flex min-h-dvh flex-col items-center justify-between px-5 pb-8", isDesktop ? "pt-10" : "pt-20 lg:pt-10")}>
      {isDesktop && (
        <div className="fixed inset-x-0 top-0 z-[60] flex h-8 items-center justify-end px-2 [-webkit-app-region:drag]">
          <button
            type="button"
            onClick={() => desktop()?.hide()}
            aria-label="hide to tray"
            title="hide (ctrl+shift+space brings me back)"
            className="grid size-6 place-items-center rounded-full text-faint transition hover:bg-panel-2 hover:text-fg [-webkit-app-region:no-drag]"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}
      <div className="flex w-full max-w-3xl items-center justify-between gap-2">
        <div className="relative min-w-0">
          <button
            type="button"
            onClick={() => setSessionsOpen((v) => !v)}
            className="inline-flex max-w-[60vw] items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-muted transition hover:bg-panel-2 hover:text-fg"
          >
            <History className="size-3.5 shrink-0 text-faint" />
            <span className="truncate">{sessionTitle ? sessionTitle : "new session"}</span>
            <ChevronDown className="size-3 shrink-0 text-faint" />
          </button>
          {sessionsOpen && (
            <div className="sheet absolute left-0 top-10 z-50 w-[min(86vw,340px)] p-2 animate-pop">
              <button
                type="button"
                onClick={newSession}
                className="mb-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-medium text-accent transition hover:bg-accent-soft"
              >
                <Plus className="size-4" /> new session
              </button>
              <p className="px-3 pb-1 pt-2 font-mono text-[10.5px] text-faint">{"// earlier voice sessions"}</p>
              <div className="max-h-72 overflow-y-auto">
                {sessions.length === 0 && <p className="px-3 py-2 text-xs text-faint">none yet</p>}
                {sessions.map((x) => (
                  <a
                    key={x.id}
                    href={`/talk?c=${x.id}`}
                    className={cn("flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] transition hover:bg-panel-2", x.id === convoId.current ? "bg-panel-2 text-fg" : "text-muted")}
                  >
                    <span className="min-w-0 flex-1 truncate">{x.title}</span>
                    <span className="shrink-0 font-mono text-[10.5px] text-faint">
                      {Math.ceil(x.turns / 2)} · {ago(x.updatedAt)}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
        <Link
          href={convoId.current ? `/?c=${convoId.current}` : "/"}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-muted hover:bg-panel-2 hover:text-fg"
        >
          <X className="size-3.5" /> {convoId.current ? "continue typing" : "back to typing"}
        </Link>
      </div>

      <div className="flex flex-col items-center">
        <button
          type="button"
          onClick={tapOrb}
          disabled={!status.enabled}
          aria-label={phase === "listening" ? "stop listening" : "talk"}
          className="relative grid place-items-center rounded-full outline-none transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <VoiceOrb state={orbState} level={level} size={340} />
          {phase === "listening" && <Mic className="absolute size-6 text-accent-ink/80" />}
          {(phase === "transcribing" || phase === "thinking") && <Loader2 className="absolute size-6 animate-spin text-accent-ink/70" />}
        </button>
        <p className={cn("mt-4 h-5 text-sm transition", phase === "listening" ? "text-accent" : "text-muted")}>{hint}</p>
        {!awake && wakeOn && canWake && status.enabled && (
          <p className="mt-1 h-4 max-w-xs truncate text-center font-mono text-[10.5px] text-faint">{standbyHeard ? `hearing: ${standbyHeard}` : "standby on, listening for the wake phrase"}</p>
        )}
      </div>

      <div className="relative w-full max-w-2xl">
        <div className="max-h-[30vh] space-y-3 overflow-y-auto px-1 pb-1 [mask-image:linear-gradient(to_bottom,transparent,black_28px)] pt-6">
          {history.length === 0 && !heard && !reply && sessionTitle === null && (
            <p className="text-center text-sm text-faint">fresh session. I still know everything about you, this is just a new convo.</p>
          )}
          {history.map((t, i) =>
            t.role === "user" ? (
              <p key={i} className="ml-auto max-w-[85%] text-right text-sm text-faint">
                {t.content}
              </p>
            ) : (
              <p key={i} className="max-w-[92%] text-[15px] leading-snug text-muted">
                {screen(t.content)}
              </p>
            ),
          )}
          {heard && <p className="ml-auto max-w-[85%] text-right text-sm text-faint">{heard}</p>}
          {reply && <p className="max-w-[95%] font-display text-xl leading-snug text-fg md:text-2xl">{reply}</p>}
          <div ref={transcriptEnd} />
        </div>
      </div>

      <div className="flex w-full max-w-3xl flex-col items-center gap-4">
        <div className="flex items-center gap-2">
          {canWake && (
            <button
              type="button"
              onClick={() => setWakeOn((v) => !v)}
              title='wake phrases: "yo wassup gang", "hey aditya", "hey jarvis"'
              className={cn("inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs transition", wakeOn ? "border-accent-line bg-accent-soft text-accent" : "border-line-strong text-muted hover:text-fg")}
            >
              {wakeOn ? <Ear className="size-3.5" /> : <EarOff className="size-3.5" />} wake word {wakeOn ? "on" : "off"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setMuted((v) => !v)}
            className={cn("inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs transition", muted ? "border-warn/40 bg-warn/10 text-warn" : "border-line-strong text-muted hover:text-fg")}
          >
            {muted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />} {muted ? "text replies (saves credits)" : "voice replies"}
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setPickerOpen((v) => !v)}
              className={cn("inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs transition", pickerOpen ? "border-accent-line bg-accent-soft text-accent" : "border-line-strong text-muted hover:text-fg")}
            >
              <SlidersHorizontal className="size-3.5" /> voice
            </button>
            {pickerOpen && (
              <div className="absolute bottom-12 left-1/2 -translate-x-1/2">
                <VoicePicker onClose={() => setPickerOpen(false)} />
              </div>
            )}
          </div>
          {awake && (
            <button type="button" onClick={stopAll} className="inline-flex items-center gap-1.5 rounded-full border border-line-strong px-3.5 py-2 text-xs text-muted hover:border-faint hover:text-fg">
              <Moon className="size-3.5" /> sleep
            </button>
          )}
        </div>
        <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 font-mono text-[10.5px] text-faint">
          <span className="inline-flex items-center gap-1">
            <AudioLines className="size-3" /> {u.month}: spoke {k(u.ttsChars)}/{k(u.charCap)} chars · heard {u.sttMinutes}/{u.sttMinuteCap} min
          </span>
          {status.quota && status.quota.limit > 0 && (
            <span>
              elevenlabs plan: {k(status.quota.used)}/{k(status.quota.limit)} credits used{status.quota.resetsAt ? `, resets ${status.quota.resetsAt}` : ""}
            </span>
          )}
          <span>space = talk · esc = stop</span>
        </p>
      </div>
    </div>
  );
}
