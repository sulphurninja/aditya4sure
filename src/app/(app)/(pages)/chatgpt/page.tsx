import { ChatGptImporter } from "@/components/chatgpt-importer";
import { PageHeader } from "@/components/ui";
import { chatgptStatus, learnEstimate } from "@/lib/server/chatgpt";

export const metadata = { title: "ChatGPT" };

export default async function ChatGptPage() {
  const [status, estimate] = await Promise.all([
    chatgptStatus().catch(() => ({ total: 0, aditya: 0, mother: 0, unknown: 0, unsorted: 0, learned: 0, conversations: [] })),
    learnEstimate().catch(() => ({ conversations: 0, tokens: 0, usd: 0 })),
  ]);
  return (
    <>
      <PageHeader eyebrow="chatgpt" title="years of your thinking, sorted.">
        your ChatGPT history, with your mom&apos;s conversations kept apart. I only learn from yours.
      </PageHeader>
      <ChatGptImporter initial={{ ...status, estimate }} />
    </>
  );
}
