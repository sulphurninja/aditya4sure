import { VoiceMode } from "@/components/voice/voice-mode";
import { getConversation, isWarm, voiceSessions } from "@/lib/server/queries";
import { elevenQuota, voiceConfig, voiceUsage } from "@/lib/server/voice-io";

export const metadata = { title: "Talk" };

/** A session stays "live" this long: come back within it and you pick up where you left off. */
const RESUME_MS = 6 * 60 * 60 * 1000;

export default async function TalkPage({ searchParams }: { searchParams: Promise<{ c?: string; new?: string }> }) {
  const sp = await searchParams;
  const [usage, quota, sessions] = await Promise.all([voiceUsage().catch(() => null), elevenQuota(), voiceSessions().catch(() => [])]);
  const cfg = voiceConfig();

  // ?c=<id> resumes that convo (voice or typed). Otherwise the latest voice session if it's still warm. ?new=1 = clean slate.
  let resumeId: string | null = sp.c?.slice(0, 80) ?? null;
  if (!resumeId && !sp.new && sessions[0] && isWarm(sessions[0].updatedAt, RESUME_MS)) resumeId = sessions[0]._id;
  const convo = resumeId ? await getConversation(resumeId).catch(() => null) : null;

  return (
    <VoiceMode
      key={convo?._id ?? "new"}
      initialStatus={{
        enabled: Boolean(cfg.key),
        usage: usage ?? { month: "", ttsChars: 0, sttMinutes: 0, charCap: cfg.charCap, sttMinuteCap: cfg.sttMinuteCap },
        quota,
      }}
      session={
        convo
          ? {
              id: convo._id,
              title: convo.title,
              updatedAt: convo.updatedAt,
              messages: convo.messages.slice(-30).map((m) => ({ role: m.role, content: m.content })),
            }
          : null
      }
      sessions={sessions.map((s) => ({ id: s._id, title: s.title, updatedAt: s.updatedAt, turns: s.turns }))}
    />
  );
}
