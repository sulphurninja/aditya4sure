import { handle, requireOwnerApi } from "@/lib/server/auth";
import { createOrGetThread, listThreads } from "@/lib/server/threads";

export async function GET(req: Request) {
  return handle(async () => {
    await requireOwnerApi(req);
    return Response.json({ threads: await listThreads() });
  });
}

/** Start (or resume) an import. Requires explicit consent to store a third-party conversation. */
export async function POST(req: Request) {
  return handle(async () => {
    await requireOwnerApi(req);
    return Response.json(await createOrGetThread(await req.json()), { status: 201 });
  });
}
