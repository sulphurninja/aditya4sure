"use client";

import { Check, Flame, Loader2, Pause, Play, SlidersHorizontal, Sparkles, Waves, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Voice = { id: string; name: string; description: string; previewUrl: string | null; labels: string[] };
type Model = { id: string; label: string; note: string; cost: number; tags: boolean };
type Prefs = { voiceId: string; model: string; style: "expressive" | "natural"; gender: "female" | "male" | "neutral" };

/** Pick who Jarvis sounds like. Previews are ElevenLabs' sample clips (free); "say something" uses a few credits. */
export function VoicePicker({ onClose }: { onClose: () => void }) {
  const [voices, setVoices] = useState<Voice[] | null>(null);
  const [models, setModels] = useState<Model[]>([]);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const player = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/voice/voices")
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "couldn't load voices");
        if (!alive) return;
        setVoices(j.voices);
        setModels(j.models);
        setPrefs(j.prefs);
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : "failed"));
    return () => {
      alive = false;
      player.current?.pause();
    };
  }, []);

  function play(id: string, url: string) {
    if (!player.current) player.current = new Audio();
    const p = player.current;
    if (playing === id) {
      p.pause();
      setPlaying(null);
      return;
    }
    p.src = url;
    p.onended = () => setPlaying(null);
    void p.play();
    setPlaying(id);
  }

  async function save(patch: Partial<Prefs>) {
    const prev = prefs;
    if (prefs) setPrefs({ ...prefs, ...patch });
    try {
      const r = await fetch("/api/voice/prefs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "failed");
      setPrefs(j.prefs);
    } catch (err) {
      setPrefs(prev);
      toast.error(err instanceof Error ? err.message : "failed");
    }
  }

  async function test() {
    const tags = models.find((m) => m.id === prefs?.model)?.tags;
    setTesting(true);
    try {
      const r = await fetch("/api/voice/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: tags ? "[excited] Heyy Aditya, I'm here. [laughs] Okay, what are we fixing today?" : "Hey Aditya, I'm here. What are we fixing today?",
        }),
      });
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "failed");
      const url = URL.createObjectURL(await r.blob());
      if (!player.current) player.current = new Audio();
      player.current.src = url;
      player.current.onended = () => URL.revokeObjectURL(url);
      void player.current.play();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="sheet relative z-50 flex max-h-[min(78dvh,640px)] w-[min(92vw,560px)] flex-col p-4 animate-pop">
      <div className="mb-3 flex items-center gap-2">
        <SlidersHorizontal className="size-4 text-accent" />
        <p className="flex-1 text-sm font-semibold text-fg">how I sound</p>
        <button type="button" onClick={test} disabled={!prefs || testing} className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1.5 text-xs text-accent transition hover:brightness-110 disabled:opacity-50">
          {testing ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />} say something
        </button>
        <button type="button" onClick={onClose} aria-label="close" className="grid size-7 place-items-center rounded-full text-faint hover:bg-panel-2 hover:text-fg">
          <X className="size-4" />
        </button>
      </div>

      <p className="mb-1.5 font-mono text-[10.5px] text-faint">{"// model"}</p>
      <div className="mb-4 grid grid-cols-2 gap-1.5">
        {models.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => save({ model: m.id })}
            className={cn("rounded-2xl border px-3 py-2 text-left transition", prefs?.model === m.id ? "border-accent-line bg-accent-soft" : "border-line-strong hover:border-faint/60")}
          >
            <p className={cn("flex items-center gap-1.5 text-[13px] font-medium", prefs?.model === m.id ? "text-accent" : "text-fg")}>
              {m.label}
              {prefs?.model === m.id && <Check className="size-3.5" />}
            </p>
            <p className="text-[11px] leading-snug text-faint">
              {m.note} · {m.cost === 0.5 ? "½ credit" : "1 credit"}/char
            </p>
          </button>
        ))}
      </div>

      <p className="mb-1.5 font-mono text-[10.5px] text-faint">{"// delivery"}</p>
      <div className="mb-4 grid grid-cols-2 gap-1.5">
        {(
          [
            ["expressive", Flame, "more emotion, laughs land better"],
            ["natural", Waves, "calmer, steadier"],
          ] as const
        ).map(([id, Icon, note]) => (
          <button
            key={id}
            type="button"
            onClick={() => save({ style: id })}
            className={cn("flex items-start gap-2 rounded-2xl border px-3 py-2 text-left transition", prefs?.style === id ? "border-accent-line bg-accent-soft" : "border-line-strong hover:border-faint/60")}
          >
            <Icon className={cn("mt-0.5 size-4 shrink-0", prefs?.style === id ? "text-accent" : "text-faint")} />
            <span>
              <span className={cn("block text-[13px] font-medium", prefs?.style === id ? "text-accent" : "text-fg")}>{id}</span>
              <span className="block text-[11px] leading-snug text-faint">{note}</span>
            </span>
          </button>
        ))}
      </div>

      <p className="mb-1.5 font-mono text-[10.5px] text-faint">{"// voice (previews are free)"}</p>
      {!voices ? (
        <div className="grid place-items-center py-10">
          <Loader2 className="size-5 animate-spin text-faint" />
        </div>
      ) : (
        <ul className="-mx-1 min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1">
          {voices.map((v) => {
            const on = prefs?.voiceId === v.id;
            return (
              <li key={v.id} className={cn("flex items-center gap-2 rounded-2xl px-2 py-1.5 transition", on ? "bg-accent-soft" : "hover:bg-panel-2")}>
                <button
                  type="button"
                  disabled={!v.previewUrl}
                  onClick={() => v.previewUrl && play(v.id, v.previewUrl)}
                  aria-label={`preview ${v.name}`}
                  className="grid size-8 shrink-0 place-items-center rounded-full bg-panel-2 text-muted transition hover:text-accent disabled:opacity-30"
                >
                  {playing === v.id ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => save({ voiceId: v.id, gender: v.labels.includes("female") ? "female" : v.labels.includes("male") ? "male" : "neutral" })}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className={cn("truncate text-[13.5px]", on ? "font-semibold text-accent" : "text-fg")}>{v.name}</p>
                  <p className="truncate text-[11px] text-faint">{[v.description, ...v.labels].filter(Boolean).join(" · ")}</p>
                </button>
                {on && <Check className="size-4 shrink-0 text-accent" />}
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-3 text-[11px] text-faint">want an indian voice or your own? add one from the ElevenLabs voice library (or clone yours) and it shows up here.</p>
    </div>
  );
}
