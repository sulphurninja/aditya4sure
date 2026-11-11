import { FileArchive, Mail, MessageSquareText } from "lucide-react";
import Link from "next/link";
import { InstagramAccountImport } from "@/components/instagram-account-import";
import { SeedImport } from "@/components/seed-import";
import { Badge, Card, PageHeader } from "@/components/ui";

export const metadata = { title: "Sources & Imports" };

const MAILBOXES = [
  { address: "aditya4sure.dev@gmail.com", kind: "Personal Gmail" },
  { address: "sulphurninja@gmail.com", kind: "Personal Gmail" },
  { address: "adityapingle15@gmail.com", kind: "Personal Gmail" },
  { address: "aditya@zaptick.io", kind: "work, Workspace mailbox?" },
  { address: "hello@zaptick.io", kind: "work, alias or shared inbox?" },
];

function Upcoming({ icon, title, sprint, children }: { icon: React.ReactNode; title: string; sprint: string; children: React.ReactNode }) {
  return (
    <Card className="p-6">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl border border-line-strong bg-elev text-muted [&_svg]:size-5">{icon}</span>
          <h2 className="text-[15px] font-medium">{title}</h2>
        </div>
        <Badge>{sprint}</Badge>
      </div>
      <div className="space-y-2 text-sm text-muted">{children}</div>
    </Card>
  );
}

export default function SourcesPage() {
  return (
    <>
      <PageHeader eyebrow="sources" title="what feeds your brain.">
        only real, connected stuff shows up as live. anything not built yet says so, no fake buttons.
      </PageHeader>
      <div className="space-y-5">
        <SeedImport />
        <InstagramAccountImport />
        <div className="grid gap-5 lg:grid-cols-2">
          <Upcoming icon={<FileArchive />} title="ChatGPT archive" sprint="Sprint 2 · next">
            <p>
              Export now so it&apos;s ready: ChatGPT → Settings → Data controls → <strong className="text-fg">Export data</strong>. You&apos;ll get a ZIP by email.
            </p>
            <p>The importer will parse it locally, dedupe by content hash, classify each conversation&apos;s author as <em>Aditya / Mother / unknown</em> and quarantine anything ambiguous for your review.</p>
            <p className="text-faint">keep the ZIP outside this repo. <span className="font-mono">/imports</span> is git-ignored if you drop it there.</p>
          </Upcoming>
          <Link href="/chats" className="group">
            <Card className="h-full p-6 transition group-hover:-translate-y-0.5 group-hover:shadow-[0_16px_40px_-20px_var(--accent)]">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-2xl bg-grad text-accent-ink">
                    <MessageSquareText className="size-5" />
                  </span>
                  <h2 className="text-[15px] font-medium">WhatsApp & Instagram chats</h2>
                </div>
                <Badge tone="ok">live</Badge>
              </div>
              <div className="space-y-2 text-sm text-muted">
                <p>Per-chat, opt-in. Parsed in your browser, encrypted in your DB. Ask questions about a chat, learn memories from it, and teach ADITYA your real voice from your own messages.</p>
                <p className="font-medium text-accent">Import a chat →</p>
              </div>
            </Card>
          </Link>
        </div>
        <Card className="p-6">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl border border-line-strong bg-elev text-muted">
                <Mail className="size-5" />
              </span>
              <div>
                <h2 className="text-[15px] font-medium">Gmail, via your own OAuth app</h2>
                <p className="text-xs text-faint">gmail.readonly first · tokens encrypted · per-mailbox disconnect & delete</p>
              </div>
            </div>
            <Badge>Sprint 3</Badge>
          </div>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {MAILBOXES.map((m) => (
              <li key={m.address} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="font-mono text-[13px] text-fg">{m.address}</span>
                <span className="flex items-center gap-2">
                  <span className="hidden text-xs text-faint md:inline">{m.kind}</span>
                  <Badge>not connected</Badge>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-faint">These are 5 addresses, not necessarily 5 inboxes. During setup each will be classified as its own mailbox, a sendAs alias of another, or a group/shared inbox that needs a different integration.</p>
        </Card>
      </div>
    </>
  );
}
