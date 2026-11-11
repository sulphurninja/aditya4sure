import { handle, HttpError, requireOwnerApi } from "@/lib/server/auth";
import { deleteGoal, updateGoal } from "@/lib/server/money";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    await requireOwnerApi(req);
    return Response.json({ goal: await updateGoal((await params).id, await req.json()) });
  });
}

export async function DELETE(req: Request, { params }: Ctx) {
  return handle(async () => {
    await requireOwnerApi(req);
    if (req.headers.get("x-confirm-delete") !== "yes") throw new HttpError(428, "Deletion must be confirmed");
    return Response.json(await deleteGoal((await params).id));
  });
}
