import { z } from "zod";
import { handle, requireOwnerApi } from "@/lib/server/auth";
import { voiceFromThread } from "@/lib/server/threads";

const Body = z.object({
  mode: z.enum(["personal", "professional", "affectionate", "creative"]),
  count: z.number().int().min(5).max(60).default(24),
});

/** Turn your own messages from this chat into voice samples for a mode. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireOwnerApi(req);
    const { mode, count } = Body.parse(await req.json());
    return Response.json(await voiceFromThread((await params).id, mode, count));
  });
}
