import { notFound } from "next/navigation";
import { EntityDetail } from "@/components/entity-detail";
import { entityDetail } from "@/lib/server/queries";

export default async function PersonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await entityDetail(["person", "pet"], slug);
  if (!data) notFound();
  const first = data.entity.name.split(" ")[0];
  return (
    <EntityDetail
      entity={data.entity}
      memories={data.memories}
      links={data.links}
      back={{ href: "/people", label: "People" }}
      askPrompt={data.entity._id === "person:aditya" ? "Give me an honest summary of who I am right now, based on my memory." : `What do I know about ${first}, and how has it evolved over time?`}
    />
  );
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  return { title: (await params).slug.replace(/-/g, " ") };
}
