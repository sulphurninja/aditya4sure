"use client";

import { Loader2, Plus, Quote, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import type { StyleSample } from "@/lib/domain";
import { Badge, Button, Card, Input, Textarea } from "@/components/ui";
import { api, cn } from "@/lib/utils";

const MODES = [
  { id: "personal", label: "casual", hint: "texts to friends, quick replies, banter" },
  { id: "professional", label: "pro", hint: "emails, LinkedIn, outreach, client replies" },
  { id: "affectionate", label: "warm", hint: "texts to people you love" },
  { id: "creative", label: "creative", hint: "bars, captions, hooks you wrote" },
] as const;

type Mode = (typeof MODES)[number]["id"];

export function StyleStudio({ samples: initial }: { samples: StyleSample[] }) {
  const router = useRouter();
  const [samples, setSamples] = useState(initial);
  const [mode, setMode] = useState<Mode>("personal");
  const [text, setText] = useState("");
  const [audience, setAudience] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    setBusy(true);
    try {
      const res = await api<{ sample: StyleSample }>("/api/style-samples", { method: "POST", json: { mode, text, audience: audience || undefined } });
      setSamples((s) => [res.sample, ...s]);
      setText("");
      setAudience("");
      toast.success("saved. this mode sounds a bit more like you now");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/style-samples/${id}`, { method: "DELETE" });
    if (res.ok) setSamples((s) => s.filter((x) => x._id !== id));
  }

  const list = samples.filter((s) => s.mode === mode);
  const active = MODES.find((m) => m.id === mode)!;

  return (
    <Card className="p-6">
      <div className="mb-5">
        <h2 className="font-display text-2xl font-bold tracking-tight">voice studio</h2>
        <p className="mt-1 text-sm text-muted">
          paste real texts <em>you</em> wrote. I pull them per mode when it writes as you. no training, and only the samples for the mode you&apos;re in ever leave. 5 to 10 per mode makes a huge difference.
        </p>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {MODES.map((m) => {
          const n = samples.filter((s) => s.mode === m.id).length;
          return (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={cn("rounded-full border px-3 py-1.5 text-xs transition", mode === m.id ? "border-accent/50 bg-accent-soft text-accent" : "border-line text-muted hover:text-fg")}
            >
              {m.label} <span className="ml-1 font-mono opacity-70">{n}</span>
            </button>
          );
        })}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-2">
          <Textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={`A real ${active.label.toLowerCase()} message you wrote: ${active.hint.toLowerCase()}.`} />
          <div className="flex gap-2">
            <Input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="to whom? (optional)" />
            <Button variant="primary" onClick={add} disabled={busy || text.trim().length < 3}>
              {busy ? <Loader2 className="animate-spin" /> : <Plus />} Add
            </Button>
          </div>
          <p className="text-xs text-faint">only your own words here, not other people&apos;s messages.</p>
        </div>
        <div className="max-h-[320px] space-y-2 overflow-y-auto">
          {list.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line-strong p-6 text-center text-sm text-faint">No {active.label.toLowerCase()} samples yet. till then I&apos;m guessing from your style notes. import a WhatsApp chat and hit teach my voice, way faster.</p>
          ) : (
            list.map((s) => (
              <div key={s._id} className="group relative rounded-2xl bg-panel-2 p-3 pr-9">
                <Quote className="mb-1 size-3.5 text-accent/60" />
                <p className="whitespace-pre-wrap text-sm text-fg/90">{s.text}</p>
                {s.audience && <Badge className="mt-2">{s.audience}</Badge>}
                <button onClick={() => remove(s._id)} className="absolute right-2 top-2 hidden rounded p-1 text-faint hover:text-danger group-hover:block" aria-label="Delete sample">
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </Card>
  );
}
