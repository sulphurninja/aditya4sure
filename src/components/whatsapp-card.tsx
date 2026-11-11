"use client";

import { BellRing, Loader2, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge, Button, Card } from "@/components/ui";
import { SourceIcon } from "@/components/source-icon";

type Note = { _id: string; text: string; whatsapp: string; voice: string; createdAt: string };

export function WhatsAppCard({ ready, voiceReady, to, initial }: { ready: boolean; voiceReady: boolean; to: string | null; initial: Note[] }) {
  const [notes, setNotes] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function test() {
    setBusy(true);
    try {
      const r = await fetch("/api/reminders/test", { method: "POST" });
      const j = (await r.json()) as { notification?: Note; error?: string };
      if (!r.ok || !j.notification) throw new Error(j.error ?? "failed");
      setNotes((n) => [j.notification!, ...n]);
      const n = j.notification;
      if (n.whatsapp === "sent") toast.success(n.voice === "sent" ? "sent, text + voice note. check your whatsapp" : "text sent, check your whatsapp");
      else if (n.whatsapp === "window closed") toast.error("whatsapp's 24h window is closed. send any message to your business number, then try again");
      else toast.error(`whatsapp: ${n.whatsapp}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-6 lg:col-span-2">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <SourceIcon source="whatsapp" className="size-4" /> reminders on whatsapp
        </h2>
        {ready ? <Badge tone="ok">connected via zaptick</Badge> : <Badge tone="warn">not connected</Badge>}
        {ready && (voiceReady ? <Badge tone="ok">voice notes on</Badge> : <Badge>voice notes need a public url</Badge>)}
        <Button size="sm" variant="outline" className="ml-auto" onClick={test} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Send />} send a test ping
        </Button>
      </div>
      <p className="mb-4 max-w-2xl text-sm text-muted">
        tell me &quot;meeting with pranav at 3&quot; (typed or out loud) and I&apos;ll ping {to ? <span className="text-fg">{to}</span> : "your number"} 15 min before, in your style. whatsapp only lets your business number text you freely within 24h of your last message to it, so keep the chat alive. nothing ever goes to anyone else.
        {!ready && " add ZAPTICK_API_KEY and OWNER_WHATSAPP to .env.local to switch it on."}
        {ready && !voiceReady && " voice notes start once the app lives on a public https url (PUBLIC_URL), since whatsapp has to fetch the audio."}
      </p>
      <p className="mb-1.5 font-mono text-[10.5px] text-faint">{"// last pings"}</p>
      {notes.length === 0 ? (
        <p className="text-sm text-faint">none yet.</p>
      ) : (
        <ul className="max-h-60 space-y-2 overflow-y-auto">
          {notes.map((n) => (
            <li key={n._id} className="flex items-start gap-2.5 text-sm">
              <BellRing className="mt-0.5 size-3.5 shrink-0 text-accent" />
              <div className="min-w-0 flex-1">
                <p className="whitespace-pre-wrap text-fg">{n.text}</p>
                <p className="font-mono text-[10.5px] text-faint">
                  {new Date(n.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} · whatsapp {n.whatsapp} · voice {n.voice}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
