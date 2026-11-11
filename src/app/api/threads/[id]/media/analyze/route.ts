import { z } from "zod";
import { handle, requireOwnerApi } from "@/lib/server/auth";
import { analyzeMedia, retryFailedMedia } from "@/lib/server/media";

export const maxDuration = 300;

const Body = z.object({ limit: z.number().int().min(1).max(8).default(4), retryFailed: z.boolean().default(false) });

/** Describe the next few photos with Claude vision. The client loops this with a progress bar. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireOwnerApi(req);
    const id = (await params).id;
    const body = Body.parse(await req.json().catch(() => ({})));
    if (body.retryFailed) return Response.json(await retryFailedMedia(id));
    return Response.json(await analyzeMedia(id, body.limit));
  });
}
