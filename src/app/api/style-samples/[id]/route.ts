import { OWNER_ID } from "@/lib/domain";
import { audit } from "@/lib/server/audit";
import { handle, HttpError, requireOwnerApi } from "@/lib/server/auth";
import { collections } from "@/lib/server/db";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireOwnerApi(req);
    const id = (await params).id;
    const { styleSamples } = await collections();
    const res = await styleSamples.deleteOne({ _id: id, ownerId: OWNER_ID });
    if (!res.deletedCount) throw new HttpError(404, "Not found");
    await audit({ actor: "owner", action: "style.delete", targetType: "style_sample", targetId: id });
    return Response.json({ ok: true });
  });
}
