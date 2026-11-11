import { notFound } from "next/navigation";
import { ThreadView } from "@/components/thread-view";
import { mediaModel } from "@/lib/server/media";
import { threadMessages } from "@/lib/server/threads";

export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await threadMessages(id, { limit: 400 }).catch(() => null);
  if (!data) notFound();
  return <ThreadView key={data.thread._id} thread={data.thread} initial={data.messages} hasMore={data.hasMore} mediaModel={mediaModel()} />;
}

export async function generateMetadata() {
  return { title: "Chat" };
}
