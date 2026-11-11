"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { ImportWizard } from "@/components/import-wizard";
import { Button } from "@/components/ui";

export function ChatsImport({ hasThreads, inline }: { hasThreads: boolean; inline?: boolean }) {
  const [open, setOpen] = useState(false);
  if (inline) return <ImportWizard />;
  if (!hasThreads) return null;
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <Plus /> Import chat
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/60 p-4 backdrop-blur-md" onClick={() => setOpen(false)}>
          <div className="w-full max-w-4xl animate-pop" onClick={(e) => e.stopPropagation()}>
            <ImportWizard onClose={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
