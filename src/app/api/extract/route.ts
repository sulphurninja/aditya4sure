import { z } from "zod";
import { handle, requireOwnerApi } from "@/lib/server/auth";
import { extractFromConversation } from "@/lib/server/extract";

export const maxDuration = 300;

const Body = z.object({ conversationId: z.string().min(3).max(80) });

/** Proposes candidate memories from a conversation. Nothing is stored until you approve. */
export async function POST(req: Request) {
  return handle(async () => {
    await requireOwnerApi(req);
    const { conversationId } = Body.parse(await req.json());
    return Response.json(await extractFromConversation(conversationId));
  });
}
