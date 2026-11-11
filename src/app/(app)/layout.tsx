import { Shell } from "@/components/shell";
import { requireOwnerPage } from "@/lib/server/auth";
import { env, setupStatus } from "@/lib/server/env";
import { pendingReviewCount } from "@/lib/server/queries";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireOwnerPage();
  const status = setupStatus();
  let pending = 0;
  let dbError: string | null = null;
  if (status.mongo) {
    try {
      pending = await pendingReviewCount();
    } catch (err) {
      dbError = err instanceof Error ? err.message.slice(0, 160) : "unknown";
    }
  }
  return (
    <Shell pendingReview={pending} ownerName={env().OWNER_NAME}>
      {(!status.mongo || dbError) && (
        <div className="relative z-20 border-b border-danger/30 bg-danger/10 px-6 py-2.5 text-sm text-danger">
          {!status.mongo ? "MONGODB_URI isn't set, so memory is offline. check the README." : `Can't reach MongoDB: ${dbError}`}
        </div>
      )}
      {children}
    </Shell>
  );
}
