"use client";

import { Button, EmptyState } from "@/components/ui";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <EmptyState title="Something broke on this page" action={<Button onClick={reset}>Try again</Button>}>
      {error.digest ? `Reference ${error.digest}. ` : ""}Check the server log and the MongoDB connection.
    </EmptyState>
  );
}
