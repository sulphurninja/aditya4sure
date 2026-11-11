"use client";

import { Check, FileUp, Loader2, Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { SourceIcon } from "@/components/source-icon";
import { Badge, Button } from "@/components/ui";
import { ACCOUNT_FILES, buildAccountFacts, type AccountFact } from "@/lib/importers/instagram-account";
import { IG_MESSAGE_FILE, parseInstagram } from "@/lib/importers/instagram";
import { listZip, readZipText } from "@/lib/importers/zip";
import { cn } from "@/lib/utils";

type Built = { facts: AccountFact[]; username: string | null; displayName: string | null; exportedAt: string };

/** Sources card: turns the account side of an Instagram export into memories. DMs go through /chats. */
export function InstagramAccountImport() {
  const router = useRouter();
  const [busy, setBusy] = useState<"read" | "import" | null>(null);
  const [built, setBuilt] = useState<Built | null>(null);
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<Record<string, number> | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function read(file: File) {
    setBusy("read");
    setResult(null);
    try {
      const entries = await listZip(file);
      const files = new Map<string, unknown>();
      for (const e of entries.filter((x) => ACCOUNT_FILES.test(x.name))) {
        const text = await readZipText(file, e);
        try {
          files.set(e.name, e.name.endsWith(".srt") ? text : JSON.parse(text));
        } catch {}
      }
      // DM activity summary (texts never leave the browser here)
      const byFolder = new Map<string, typeof entries>();
      for (const e of entries) {
        const m = IG_MESSAGE_FILE.exec(e.name);
        if (m && m[1] === "inbox") byFolder.set(m[2], [...(byFolder.get(m[2]) ?? []), e]);
      }
      const dms = [];
      for (const [, fs] of byFolder) {
        const t = parseInstagram(await Promise.all(fs.map((f) => readZipText(file, f))));
        dms.push({ title: t.title, count: t.messages.length, selfCount: 0, firstAt: t.messages[0]?.at ?? null, lastAt: t.messages.at(-1)?.at ?? null });
      }
      const exportedAt = /(\d{4}-\d{2}-\d{2})/.exec(file.name)?.[1] ?? new Date().toISOString().slice(0, 10);
      const b = buildAccountFacts(files, { exportedAt, dms });
      if (!b.facts.length) throw new Error("couldn't find account data. export in JSON format with your information included.");
      setBuilt({ ...b, exportedAt });
      setSkip(new Set());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "couldn't read that zip");
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
    }
  }

  async function save() {
    if (!built) return;
    setBusy("import");
    try {
      const res = await fetch("/api/imports/instagram-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exportedAt: built.exportedAt, username: built.username, displayName: built.displayName, facts: built.facts.filter((f) => !skip.has(f.key)) }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "import failed");
      setResult(d);
      setBuilt(null);
      toast.success(`${d.inserted} new, ${d.updated} updated from your Instagram`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "import failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="sheet relative p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex gap-4">
          <SourceIcon source="instagram" className="size-10" />
          <div>
            <p className="font-mono text-[11px] text-faint">{"// instagram account"}</p>
            <h2 className="font-display text-xl font-bold tracking-tight">everything about you on Insta</h2>
            <p className="mt-1 max-w-xl text-sm text-muted">
              profile & bio history, when you joined, audience and reel stats, stories, close friends, who you DM most, what you search, watch and open, places Instagram ties to you. your phone contacts, autofill and IP logs are skipped. DMs themselves import from the chats page.
            </p>
          </div>
        </div>
        <Button onClick={() => input.current?.click()} disabled={busy !== null}>
          {busy === "read" ? <Loader2 className="animate-spin" /> : <FileUp />} pick export zip
        </Button>
        <input ref={input} type="file" accept=".zip,application/zip" hidden onChange={(e) => e.target.files?.[0] && read(e.target.files[0])} />
      </div>

      {result && (
        <p className="mt-5 flex items-center gap-2 text-sm text-ok">
          <Check className="size-4" /> {result.inserted} new · {result.updated} updated · {result.unchanged} unchanged · {result.preserved} kept as you edited them
        </p>
      )}

      {built && (
        <div className="mt-6 animate-rise">
          <p className="mb-2 font-mono text-[11px] text-faint">{`// ${built.facts.length - skip.size} of ${built.facts.length} facts for @${built.username ?? "you"}. untick anything you don't want`}</p>
          <ul className="max-h-[420px] overflow-y-auto rounded-xl border border-line">
            {built.facts.map((f) => (
              <li key={f.key} className="dashed-bottom flex items-start gap-3 px-3 py-2.5 text-sm last:border-0">
                <input
                  type="checkbox"
                  checked={!skip.has(f.key)}
                  onChange={() => {
                    const n = new Set(skip);
                    if (n.has(f.key)) n.delete(f.key);
                    else n.add(f.key);
                    setSkip(n);
                  }}
                  className="mt-1 accent-accent"
                />
                <span className={cn("flex-1 text-muted", skip.has(f.key) && "line-through opacity-50")}>{f.statement.length > 260 ? f.statement.slice(0, 259) + "…" : f.statement}</span>
                <span className="flex shrink-0 gap-1">
                  {f.isInferred && <Badge tone="warn">Meta&apos;s guess</Badge>}
                  {f.sensitivity === "sensitive" && <Badge tone="sensitive">sensitive</Badge>}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="flex items-center gap-1.5 font-mono text-[10.5px] text-faint">
              <Lock className="size-3" /> parsed on your laptop · re-importing a newer export updates, never duplicates
            </p>
            <Button variant="primary" onClick={save} disabled={busy !== null}>
              {busy === "import" ? <Loader2 className="animate-spin" /> : <Check />} add to my brain
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
