import { Sparkles } from "lucide-react";
import Link from "next/link";
import { MemoryCard } from "@/components/memory/memory-card";
import { StyleStudio } from "@/components/style-studio";
import { VoiceProfileCard } from "@/components/voice-profile";
import { getVoiceProfile } from "@/lib/server/voice";
import { buttonVariants, Card, PageHeader } from "@/components/ui";
import { SELF_ID } from "@/lib/domain";
import { env } from "@/lib/server/env";
import { memoriesWhere, styleSamples } from "@/lib/server/queries";

export const metadata = { title: "Me" };

export default async function MePage() {
  const [identity, voice, values, samples] = await Promise.all([
    memoriesWhere({ section: { $in: ["identity", "accounts"] }, subjectId: SELF_ID }).catch(() => []),
    memoriesWhere({ section: "communication" }).catch(() => []),
    memoriesWhere({ subjectId: SELF_ID, type: { $in: ["belief", "preference"] }, section: { $nin: ["communication"] } }).catch(() => []),
    styleSamples().catch(() => []),
  ]);
  const vp = await getVoiceProfile().catch(() => null);
  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="me"
        title={
          <>
            {env().OWNER_NAME.split(" ")[0]}, <span className="text-grad">as your brain sees you.</span>
          </>
        }
        actions={
          <Link href={`/?q=${encodeURIComponent("Be brutally honest: based only on my memory, what are my strengths, blind spots and current priorities?")}`} className={buttonVariants({ variant: "primary" })}>
            <Sparkles /> roast me (nicely)
          </Link>
        }
      >
        who you are, what you care about, how you talk. something off? open the card and fix it.
      </PageHeader>

      <VoiceProfileCard profile={vp ? { guide: vp.guide, withKomal: vp.withKomal, lines: vp.lines, sampleSize: vp.sampleSize, updatedAt: vp.updatedAt } : null} />

      <StyleStudio samples={samples} />

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-medium">how you talk</h2>
          <div className="grid gap-3">
            {voice.length ? voice.map((m) => <MemoryCard key={m._id} m={m} compact showSection={false} />) : <Card className="p-5 text-sm text-faint">nothing on your voice yet.</Card>}
          </div>
        </section>
        <section>
          <h2 className="mb-3 text-sm font-medium">who you are</h2>
          <div className="grid gap-3">
            {identity.length ? identity.map((m) => <MemoryCard key={m._id} m={m} compact showSection={false} />) : <Card className="p-5 text-sm text-faint">nothing here yet.</Card>}
          </div>
          {values.length > 0 && (
            <>
              <h2 className="mb-3 mt-8 text-sm font-medium">what you care about</h2>
              <div className="grid gap-3">
                {values.map((m) => (
                  <MemoryCard key={m._id} m={m} compact />
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
