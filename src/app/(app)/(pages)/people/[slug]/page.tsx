import { notFound } from "next/navigation";
import { EntityDetail } from "@/components/entity-detail";
import { DatesCard, GiftRadar, PrepButton } from "@/components/people-extras";
import { allDates, giftIdeas } from "@/lib/server/people";
import { entityDetail } from "@/lib/server/queries";
import { threadsForEntities } from "@/lib/server/threads";

export default async function PersonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await entityDetail(["person", "pet"], slug);
  if (!data) notFound();
  const first = data.entity.name.split(" ")[0];
  const isSelf = data.entity._id === "person:aditya";
  const [dates, gifts, threads] = isSelf
    ? [[], [], []]
    : await Promise.all([
        allDates()
          .then((all) => all.filter((d) => d.personId === data.entity._id))
          .catch(() => []),
        giftIdeas(data.entity._id).catch(() => []),
        threadsForEntities([data.entity._id]).catch(() => []),
      ]);
  return (
    <EntityDetail
      entity={data.entity}
      memories={data.memories}
      links={data.links}
      back={{ href: "/people", label: "People" }}
      askPrompt={isSelf ? "Give me an honest summary of who I am right now, based on my memory." : `What do I know about ${first}, and how has it evolved over time?`}
    >
      {!isSelf && data.entity.kind === "person" && (
        <div className="mb-8 space-y-4">
          <PrepButton first={first} />
          <div className="grid gap-4 md:grid-cols-2">
            <DatesCard initial={dates.map((d) => ({ _id: d._id, personName: d.personName, kind: d.kind, label: d.label, monthDay: d.monthDay, next: d.next, inDays: d.inDays, confidence: d.confidence, source: d.source }))} personName={first} />
            <GiftRadar entityId={data.entity._id} name={first} initial={gifts} hasChats={threads.length > 0} />
          </div>
        </div>
      )}
    </EntityDetail>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  return { title: (await params).slug.replace(/-/g, " ") };
}
