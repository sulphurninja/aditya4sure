import { handle, HttpError, requireOwnerApi } from "@/lib/server/auth";
import { deleteThread, patchThread } from "@/lib/server/threads";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    await requireOwnerApi(req);
    return Response.json({ thread: await patchThread((await params).id, await req.json()) });
  });
}

export async function DELETE(req: Request, { params }: Ctx) {
  return handle(async () => {
    await requireOwnerApi(req);
    if (req.headers.get("x-confirm-delete") !== "yes") throw new HttpError(428, "Deletion must be confirmed");
    return Response.json(await deleteThread((await params).id));
  });
}
