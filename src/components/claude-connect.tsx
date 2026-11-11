"use client";

import { Bot, Check, Copy, Eye, EyeOff, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge, Button, Card } from "@/components/ui";
import { api } from "@/lib/utils";

type Activity = { id: string; tool: string; at: string };

function CopyLine({ label, value, display }: { label: string; value: string; display?: string }) {
  const [done, setDone] = useState(false);
  return (
    <div>
      <p className="mb-1 font-mono text-[10.5px] text-faint">{`// ${label}`}</p>
      <div className="flex items-start gap-2 rounded-2xl border border-line-strong bg-panel px-3 py-2">
        <code className="min-w-0 flex-1 break-all font-mono text-[12px] text-muted">{display ?? value}</code>
        <button
          type="button"
          aria-label={`copy ${label}`}
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          }}
          className="shrink-0 text-faint hover:text-fg"
        >
          {done ? <Check className="size-4 text-ok" /> : <Copy className="size-4" />}
        </button>
      </div>
    </div>
  );
}

export function ClaudeConnect({ enabled, origin, activity }: { enabled: boolean; origin: string; activity: Activity[] }) {
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mask = "•".repeat(12);

  async function reveal() {
    if (token) return setToken(null);
    setBusy(true);
    try {
      setToken((await api<{ token: string }>("/api/settings/mcp-token")).token);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  const t = token ?? mask;
  const isLocal = /localhost|127\.0\.0\.1/.test(origin);
  const cmd = `claude mcp add --transport http -s local aditya ${origin}/api/mcp --header "Authorization: Bearer ${t}"`;

  return (
    <Card className="p-6 lg:col-span-2">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <Bot className="size-4 text-accent" /> claude, plugged into your brain
        </h2>
        {enabled ? <Badge tone="ok">mcp on</Badge> : <Badge tone="danger">off, set MCP_TOKEN</Badge>}
        {enabled && (
          <Button size="sm" variant="ghost" className="ml-auto" onClick={reveal} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : token ? <EyeOff /> : <Eye />} {token ? "hide secret" : "show secret"}
          </Button>
        )}
      </div>
      <p className="mb-4 max-w-2xl text-sm text-muted">
        claude (code, desktop, phone) reads and writes this brain over MCP, on your claude subscription. it can search memories, people and chats, save stuff you tell it, fix facts and run your todos. it never sends mail or messages without you saying yes. what it reads gets sent to Anthropic for that answer.
      </p>
      {enabled && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <CopyLine label="claude code (run once in the project)" value={cmd} display={cmd} />
            <CopyLine label="connector url for the claude app" value={`${origin}/api/mcp/${t}`} />
            {isLocal && (
              <p className="text-xs text-faint">
                the claude app (desktop / phone) can&apos;t reach localhost. that url only works once this runs on a public https address (VPS or a tunnel). claude code on this machine works right now.
              </p>
            )}
          </div>
          <div>
            <p className="mb-1 font-mono text-[10.5px] text-faint">{"// what claude did lately"}</p>
            {activity.length === 0 ? (
              <p className="text-sm text-faint">nothing yet. ask claude something about your life.</p>
            ) : (
              <ul className="max-h-56 space-y-1 overflow-y-auto">
                {activity.map((a) => (
                  <li key={a.id} className="flex justify-between gap-3 font-mono text-[11px] text-muted">
                    <span>{a.tool.replace(/_/g, " ")}</span>
                    <span className="text-faint">{new Date(a.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
