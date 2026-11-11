import { handle, requireOwnerApi } from "@/lib/server/auth";
import { learnFromRecent, pendingReviewCounts } from "@/lib/server/learn";

export const maxDuration = 300;

export async function GET(req: Request) {
  return handle(async () => {
    await requireOwnerApi(req);
    return Response.json(await pendingReviewCounts());
  });
}

/** "Learn from today" now (same as the 11:30 PM sweep). */
export async function POST(req: Request) {
  return handle(async () => {
    await requireOwnerApi(req);
    return Response.json({ result: await learnFromRecent({ force: true }), pending: await pendingReviewCounts() });
  });
}
