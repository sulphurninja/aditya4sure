"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui";

export function VoiceProfileCard({ profile }: { profile: { guide: string; withKomal: string; lines: string[]; sampleSize: number; updatedAt: string } | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function rebuild() {
    setBusy(true);
    try {
      const r = await fetch("/api/voice-profile", { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "failed");
      toast.success(`re-learned from ${d.sampleSize} of your texts`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="sheet relative p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] text-faint">{"// how you actually text"}</p>
          <h2 className="font-display text-2xl font-bold tracking-tight">your voice, learned from your chats</h2>
          {profile && <p className="mt-1 font-mono text-[10.5px] text-faint">from {profile.sampleSize} of your messages · {new Date(profile.updatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</p>}
        </div>
        <Button size="sm" onClick={rebuild} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />} re-learn
        </Button>
      </div>
      {profile ? (
        <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          <div className="space-y-4 text-sm leading-relaxed text-muted">
            <p>{profile.guide}</p>
            <p className="dashed-top pt-4">
              <span className="font-mono text-[11px] text-faint">{"// with komal "}</span>
              {profile.withKomal}
            </p>
          </div>
          <div className="flex flex-wrap content-start gap-2">
            {profile.lines.slice(0, 24).map((l, i) => (
              <span key={i} className="rounded-2xl rounded-br-md bg-grad px-3 py-1.5 text-[13px] text-accent-ink">
                {l}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted">import a chat and hit re-learn. I&apos;ll figure out how you text from your own messages.</p>
      )}
    </div>
  );
}
