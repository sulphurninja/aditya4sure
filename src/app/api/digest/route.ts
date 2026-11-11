import { z } from "zod";
import { handle, requireOwnerApi } from "@/lib/server/auth";
import { digestStatus, planDigest, runDigestChunk, runDigestOverview } from "@/lib/server/digest";

export const maxDuration = 300;

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("plan"), entityId: z.string().min(3).max(80) }),
  z.object({ action: z.literal("chunk"), entityId: z.string().min(3).max(80), index: z.number().int().min(0).max(10_000) }),
  z.object({ action: z.literal("overview"), entityId: z.string().min(3).max(80) }),
  z.object({ action: z.literal("status"), entityId: z.string().min(3).max(80) }),
]);

/** Pre-digest every imported chat with a person into first-hand memories (plan → chunks → overview). */
export async function POST(req: Request) {
  return handle(async () => {
    await requireOwnerApi(req);
    const b = Body.parse(await req.json());
    if (b.action === "plan") return Response.json(await planDigest(b.entityId));
    if (b.action === "chunk") return Response.json(await runDigestChunk(b.entityId, b.index));
    if (b.action === "overview") return Response.json(await runDigestOverview(b.entityId));
    return Response.json(await digestStatus(b.entityId));
  });
}
