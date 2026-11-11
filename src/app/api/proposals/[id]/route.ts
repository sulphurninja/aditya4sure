import { z } from "zod";
import { SENSITIVITY } from "@/lib/domain";
import { handle, requireOwnerApi } from "@/lib/server/auth";
import { resolveProposal } from "@/lib/server/extract";

const Body = z.object({
  decision: z.enum(["approve", "reject"]),
  statement: z.string().trim().min(3).max(2000).optional(),
  sensitivity: z.enum(SENSITIVITY).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireOwnerApi(req);
    const body = Body.parse(await req.json());
    const memoryId = await resolveProposal((await params).id, body.decision, body);
    return Response.json({ ok: true, memoryId });
  });
}
