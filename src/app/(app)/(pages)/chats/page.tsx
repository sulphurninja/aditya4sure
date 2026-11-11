import { Lock } from "lucide-react";
import Link from "next/link";
import { ChatsImport } from "@/components/chats-import";
import { SourceIcon } from "@/components/source-icon";
import { WallpaperLayer } from "@/components/wallpaper";
import { PageHeader } from "@/components/ui";
import { listThreads } from "@/lib/server/threads";
import { formatWhen } from "@/lib/utils";

export const metadata = { title: "Chats" };

export default async function ChatsPage() {
  const threads = await listThreads().catch(() => []);
  return (
    <>
      <PageHeader eyebrow="your chats" title="your WhatsApp & insta, finally useful." actions={<ChatsImport hasThreads={threads.length > 0} />}>
        drop a chat in and I can search it, answer stuff about it, learn from it, and pick up how you actually text. your messages, your voice.
      </PageHeader>
      {threads.length === 0 ? (
        <ChatsImport hasThreads={false} inline />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {threads.map((t, i) => (
            <Link key={t._id} href={`/chats/${t._id}`} className="group animate-rise" style={{ animationDelay: `${i * 40}ms` }}>
              <div className="glass relative h-52 overflow-hidden rounded-3xl transition duration-300 group-hover:-translate-y-1 group-hover:shadow-[0_20px_50px_-20px_var(--accent)]">
                <WallpaperLayer wp={t.wallpaper} className="opacity-80 transition group-hover:opacity-100" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-5 text-white">
                  <div className="mb-2 flex items-center gap-2">
                    <SourceIcon source={t.source} />
                    <span className="font-mono text-[10.5px] opacity-75">{t.messageCount.toLocaleString()} msgs</span>
                  </div>
                  <p className="font-display text-2xl font-bold tracking-tight">{t.title}</p>
                  <p className="mt-0.5 text-xs opacity-75">
                    {formatWhen(t.firstAt)} → {formatWhen(t.lastAt)}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
      <p className="mt-10 flex items-center justify-center gap-2 text-xs text-faint">
        <Lock className="size-3.5" /> every message is encrypted. only you can open them. nuke any chat from its menu, fully gone.
      </p>
    </>
  );
}
