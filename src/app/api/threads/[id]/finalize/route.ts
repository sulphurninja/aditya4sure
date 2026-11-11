import { handle, requireOwnerApi } from "@/lib/server/auth";
import { finalizeThread } from "@/lib/server/threads";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireOwnerApi(req);
    return Response.json(await finalizeThread((await params).id));
  });
}
