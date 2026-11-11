import { MemoryList } from "@/components/memory/memory-list";
import { NewMemoryButton } from "@/components/memory/new-memory";
import { SensitiveToggle } from "@/components/memory/sensitive";
import { PageHeader } from "@/components/ui";
import { memoriesWhere } from "@/lib/server/queries";

export const metadata = { title: "Memory Vault" };

export default async function VaultPage() {
  const memories = await memoriesWhere({}, 1000).catch(() => []);
  return (
    <>
      <PageHeader
        eyebrow="memory vault"
        title="everything I know about you."
        actions={
          <>
            <SensitiveToggle />
            <NewMemoryButton />
          </>
        }
      >
        every memory has a source, a date and a review state. open any card to see where it came from, fix it, redact it or nuke it.
      </PageHeader>
      <MemoryList memories={memories} emptyHint="Import your seed from Sources & Imports, or add a memory by hand." />
    </>
  );
}
