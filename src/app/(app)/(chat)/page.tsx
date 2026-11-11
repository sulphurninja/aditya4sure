import { Chat } from "@/components/chat/chat";
import { PERSONA_MODES, type PersonaMode } from "@/lib/domain";
import { llmInfo } from "@/lib/server/llm";
import { env } from "@/lib/server/env";
import { conversationsList, getConversation, homeNudges } from "@/lib/server/queries";
import { getThread } from "@/lib/server/threads";

export const metadata = { title: "Chat" };

function greetingFor(first: string) {
  const h = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date()));
  const day = new Date().getDate();
  const pick = <T,>(xs: T[]) => xs[day % xs.length];
  if (h < 5)
    return pick([
      { title: `${first}, still up?`, sub: "3am thoughts hit different. spill." },
      { title: `yo ${first}, late night grind?`, sub: "I'm awake too. what's on your mind?" },
    ]);
  if (h < 12)
    return pick([
      { title: `morning ${first}, what are we building?`, sub: "ask me about your life, your people, your projects. or lemme write something as you." },
      { title: `gm ${first}, kya scene hai?`, sub: "your memory's loaded. ask away." },
    ]);
  if (h < 17)
    return pick([
      { title: `hey ${first}, what's up?`, sub: "need a reply drafted, a decision checked, or just something remembered?" },
      { title: `${first}, kya chal raha hai?`, sub: "I remember stuff so you don't have to." },
    ]);
  return pick([
    { title: `evening ${first}, what's on your mind?`, sub: "talk to me man, I know your people, projects and plans." },
    { title: `yo ${first}, how was the day?`, sub: "dump it here. I'll remember what matters (with your OK)." },
  ]);
}

export default async function HomeChat({ searchParams }: { searchParams: Promise<{ c?: string; q?: string; mode?: string; thread?: string }> }) {
  const sp = await searchParams;
  const mode = (PERSONA_MODES as readonly string[]).includes(sp.mode ?? "") ? (sp.mode as PersonaMode) : "assistant";
  const [conversations, convo, scoped, nudges] = await Promise.all([
    conversationsList().catch(() => []),
    sp.c ? getConversation(sp.c).catch(() => null) : Promise.resolve(null),
    sp.thread ? getThread(sp.thread).catch(() => null) : Promise.resolve(null),
    homeNudges().catch(() => []),
  ]);
  const convoThread = convo?.threadId ? await getThread(convo.threadId).catch(() => null) : null;
  const toInfo = (t: typeof scoped) => (t ? { _id: t._id, title: t.title, source: t.source } : null);

  return (
    <Chat
      key={convo?._id ?? `new-${sp.thread ?? ""}`}
      conversations={conversations.map((c) => ({ _id: c._id, title: c.title, updatedAt: c.updatedAt, mode: c.mode, channel: c.channel }))}
      initial={convo ? { _id: convo._id, mode: convo.mode, messages: convo.messages, wallpaper: convo.wallpaper, thread: toInfo(convoThread) } : null}
      initialQuery={sp.q?.slice(0, 2000) ?? null}
      initialMode={mode}
      thread={toInfo(scoped)}
      configured={llmInfo().configured}
      model={llmInfo().model}
      greeting={greetingFor(env().OWNER_NAME.split(" ")[0])}
      nudges={nudges}
    />
  );
}
