import { z } from "zod";
import { OWNER_ID, WallpaperInput } from "@/lib/domain";
import { audit } from "@/lib/server/audit";
import { handle, HttpError, requireOwnerApi } from "@/lib/server/auth";
import { collections, nowIso } from "@/lib/server/db";

type Ctx = { params: Promise<{ id: string }> };

const Patch = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  wallpaper: WallpaperInput.optional(),
});

export async function GET(req: Request, { params }: Ctx) {
  return handle(async () => {
    await requireOwnerApi(req);
    const { conversations } = await collections();
    const convo = await conversations.findOne({ _id: (await params).id, ownerId: OWNER_ID });
    if (!convo) throw new HttpError(404, "Not found");
    return Response.json({ conversation: convo });
  });
}

export async function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    await requireOwnerApi(req);
    const input = Patch.parse(await req.json());
    const id = (await params).id;
    const { conversations } = await collections();
    const set = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
    const res = await conversations.updateOne({ _id: id, ownerId: OWNER_ID }, { $set: { ...set, updatedAt: nowIso() } });
    if (!res.matchedCount) throw new HttpError(404, "Not found");
    return Response.json({ ok: true });
  });
}

export async function DELETE(req: Request, { params }: Ctx) {
  return handle(async () => {
    await requireOwnerApi(req);
    const id = (await params).id;
    const c = await collections();
    const res = await c.conversations.deleteOne({ _id: id, ownerId: OWNER_ID });
    if (!res.deletedCount) throw new HttpError(404, "Not found");
    await c.proposals.deleteMany({ ownerId: OWNER_ID, sourceConversationId: id, status: "pending" });
    await audit({ actor: "owner", action: "conversation.delete", targetType: "conversation", targetId: id });
    return Response.json({ ok: true });
  });
}
