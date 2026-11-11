import { handle, requireOwnerApi } from "@/lib/server/auth";
import { actOnMemory } from "@/lib/server/memories";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireOwnerApi(req);
    return Response.json({ memory: await actOnMemory((await params).id, await req.json()) });
  });
}
