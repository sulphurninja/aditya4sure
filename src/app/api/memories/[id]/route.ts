import { handle, HttpError, requireOwnerApi } from "@/lib/server/auth";
import { correctMemory, deleteMemory, memoryHistory } from "@/lib/server/memories";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  return handle(async () => {
    await requireOwnerApi(req);
    const h = await memoryHistory((await params).id);
    if (!h) throw new HttpError(404, "Memory not found");
    return Response.json(h);
  });
}

/** Correct a memory, creates a new version that supersedes the old one. */
export async function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    await requireOwnerApi(req);
    return Response.json({ memory: await correctMemory((await params).id, await req.json()) });
  });
}

/** Permanently delete a memory and its older versions. Requires explicit confirmation. */
export async function DELETE(req: Request, { params }: Ctx) {
  return handle(async () => {
    await requireOwnerApi(req);
    if (req.headers.get("x-confirm-delete") !== "yes") throw new HttpError(428, "Deletion must be confirmed");
    return Response.json(await deleteMemory((await params).id));
  });
}
