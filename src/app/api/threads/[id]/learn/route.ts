import { z } from "zod";
import { handle, requireOwnerApi } from "@/lib/server/auth";
import { extractFromThread } from "@/lib/server/extract";

export const maxDuration = 300;

const Body = z.object({
  before: z.string().datetime({ offset: true }).optional(),
  window: z.number().int().min(50).max(800).default(400),
});

/** Propose memories from a window of an imported chat. Nothing is saved until approved. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireOwnerApi(req);
    const body = Body.parse(await req.json().catch(() => ({})));
    return Response.json(await extractFromThread((await params).id, body));
  });
}
