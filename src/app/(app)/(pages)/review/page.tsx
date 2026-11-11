import { SensitiveToggle } from "@/components/memory/sensitive";
import { ReviewQueue } from "@/components/review-queue";
import { PageHeader } from "@/components/ui";
import { reviewData } from "@/lib/server/queries";

export const metadata = { title: "Review" };

export default async function ReviewPage() {
  const { proposals, pending } = await reviewData().catch(() => ({ proposals: [], pending: [] }));
  return (
    <>
      <PageHeader eyebrow="review" title="tell me what's actually true." actions={<SensitiveToggle />}>
        unverified stuff still gets used, but flagged. confirm it or reject it, rejected facts never come back. nothing I propose gets saved without your yes.
      </PageHeader>
      <ReviewQueue proposals={proposals} pending={pending} />
    </>
  );
}
