import { z } from "zod";
import { handle, requireOwnerApi } from "@/lib/server/auth";
import { listDecisions, recordDecision, setDecisionStatus } from "@/lib/server/decisions";

export async function GET(req: Request) {
  return handle(async () => {
    await requireOwnerApi(req);
    return Response.json({ decisions: await listDecisions() });
  });
}

const Body = z.union([
  z.object({ id: z.string().max(40), status: z.enum(["active", "done", "changed", "dropped"]), note: z.string().max(500).nullable().optional() }),
  z.object({ statement: z.string().trim().min(4).max(500), followUp: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional() }),
]);

/** Add a decision by hand, or mark one done / changed (with the reason, said once). */
export async function POST(req: Request) {
  return handle(async () => {
    await requireOwnerApi(req);
    const b = Body.parse(await req.json());
    if ("id" in b) await setDecisionStatus(b.id, b.status, b.note);
    else await recordDecision({ statement: b.statement, followUp: b.followUp ?? null }, "owner");
    return Response.json({ decisions: await listDecisions() });
  });
}
