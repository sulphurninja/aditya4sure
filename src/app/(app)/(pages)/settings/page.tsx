import { CheckCircle2, Download, ShieldCheck, XCircle } from "lucide-react";
import { headers } from "next/headers";
import { ClaudeConnect } from "@/components/claude-connect";
import { WhatsAppCard } from "@/components/whatsapp-card";
import { recentNotifications } from "@/lib/server/reminders";
import { voiceNotesReady, whatsappConfig, whatsappReady } from "@/lib/server/whatsapp";
import { Badge, Card, PageHeader } from "@/components/ui";
import { OWNER_ID } from "@/lib/domain";
import { collections } from "@/lib/server/db";
import { env } from "@/lib/server/env";
import { llmInfo } from "@/lib/server/llm";
import { setupStatus } from "@/lib/server/env";
import { recentAudit } from "@/lib/server/queries";

export const metadata = { title: "Settings" };

function Check({ ok, label, hint }: { ok: boolean; label: string; hint: string }) {
  return (
    <li className="flex items-start gap-3 py-2.5">
      {ok ? <CheckCircle2 className="mt-0.5 size-4 text-ok" /> : <XCircle className="mt-0.5 size-4 text-danger" />}
      <div>
        <p className="text-sm text-fg">{label}</p>
        <p className="text-xs text-faint">{hint}</p>
      </div>
    </li>
  );
}

export default async function SettingsPage() {
  const s = setupStatus();
  const llm = llmInfo();
  const log = await recentAudit(60).catch(() => []);
  const pings = await recentNotifications(15).catch(() => []);
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const origin = `${h.get("x-forwarded-proto") ?? (/^(localhost|127\.)/.test(host) ? "http" : "https")}://${host}`;
  const activity = await collections()
    .then((c) => c.audit.find({ ownerId: OWNER_ID, action: /^mcp\./ }).sort({ at: -1 }).limit(40).toArray())
    .then((rows) => rows.map((r) => ({ id: r._id, tool: r.action.slice(4), at: r.at })))
    .catch(() => []);
  return (
    <>
      <PageHeader eyebrow="settings" title="your data, your rules." />
      <div className="grid gap-5 lg:grid-cols-2">
        <ClaudeConnect enabled={Boolean(env().MCP_TOKEN)} origin={origin} activity={activity} />
        <WhatsAppCard
          ready={whatsappReady()}
          voiceReady={voiceNotesReady()}
          to={whatsappConfig().to}
          initial={pings.map((n) => ({ _id: n._id, text: n.text, whatsapp: n.whatsapp, voice: n.voice, createdAt: n.createdAt }))}
        />
        <Card className="p-6">
          <h2 className="mb-2 text-sm font-medium">setup</h2>
          <ul className="divide-y divide-line">
            <Check ok={s.mongo} label="MongoDB" hint="Long-term memory store (MONGODB_URI)" />
            <Check ok={llm.configured} label={llm.provider === "openai" ? "OpenAI API" : "Anthropic API"} hint={`chat: ${llm.model} · bulk jobs: ${llm.bulkModel} · switch with LLM_PROVIDER`} />
            <Check ok={s.auth} label="Owner sign-in" hint="OWNER_PASSPHRASE + SESSION_SECRET" />
            <Check ok={s.encryption} label="Encryption key" hint="DATA_ENCRYPTION_KEY: AES-256-GCM for chats, photos and tokens. back it up." />
          </ul>
        </Card>

        <Card className="p-6">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-medium">
            <ShieldCheck className="size-4 text-accent" /> what goes where
          </h2>
          <ul className="space-y-2.5 text-sm text-muted">
            <li>
              <strong className="text-fg">MongoDB (yours)</strong> stores every memory, conversation, style sample and audit entry. It&apos;s the source of truth.
            </li>
            <li>
              <strong className="text-fg">{llm.provider === "openai" ? "OpenAI" : "Anthropic"}</strong> receives, per question: the retrieved memories (≈ up to 24), your recent chat turns, your style samples for the active mode, and your question. Toggle “Sensitive off” in Ask to keep sensitive memories out.
            </li>
            <li>
              <strong className="text-fg">Claude (Anthropic)</strong> when you use it through the MCP connector: whatever its tools read for that answer (memories, chat lines, todos) goes to Anthropic under your Claude account. Every tool call is logged below.
            </li>
            <li>“Learn from this chat” sends that conversation to the model to propose memories. Nothing is saved until you approve it.</li>
            <li>No analytics, no telemetry, no third-party scripts. Nothing is ever sent, posted or emailed on your behalf.</li>
          </ul>
        </Card>

        <Card className="p-6">
          <h2 className="mb-2 text-sm font-medium">export everything</h2>
          <p className="mb-4 text-sm text-muted">one JSON file with literally everything: memories, people, chats, proposals, voice samples, audit log.</p>
          <a href="/api/export" className="inline-flex h-9 items-center gap-2 rounded-lg border border-line-strong bg-panel-2 px-4 text-sm hover:border-faint">
            <Download className="size-4" /> download it
          </a>
        </Card>

        <Card className="p-6">
          <h2 className="mb-2 text-sm font-medium">deleting stuff</h2>
          <ul className="space-y-2 text-sm text-muted">
            <li>
              <Badge>Memory</Badge> open it → <em>Delete</em> removes it and all earlier versions permanently. <em>Redact</em> wipes the text but keeps a tombstone.
            </li>
            <li>
              <Badge>Chat</Badge> delete it from the chat sidebar. its unreviewed proposals go too.
            </li>
            <li>
              <Badge>Mailbox</Badge> per-account disconnect + delete derived data ships with Gmail in Sprint 3.
            </li>
          </ul>
        </Card>
      </div>

      <Card className="mt-5 p-6">
        <h2 className="mb-3 text-sm font-medium">audit log</h2>
        {log.length === 0 ? (
          <p className="text-sm text-faint">nothing yet.</p>
        ) : (
          <ul className="max-h-[420px] space-y-1.5 overflow-y-auto">
            {log.map((a) => (
              <li key={a._id} className="flex justify-between gap-4 font-mono text-[11px] text-faint">
                <span className="truncate">
                  <span className={a.actor === "ai" ? "text-accent" : a.actor === "owner" ? "text-muted" : ""}>{a.actor}</span> · {a.action} · {a.targetId}
                  {a.note ? ` · ${a.note}` : ""}
                </span>
                <span className="shrink-0">{a.at.slice(0, 16).replace("T", " ")}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
