import { handle, requireOwnerApi } from "@/lib/server/auth";
import { giftIdeas, scanGifts } from "@/lib/server/people";

export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };
const entityId = async (ctx: Ctx) => decodeURIComponent((await ctx.params).id).slice(0, 80);

export async function GET(req: Request, ctx: Ctx) {
  return handle(async () => {
    await requireOwnerApi(req);
    return Response.json({ ideas: await giftIdeas(await entityId(ctx)) });
  });
}

/** Scan their side of the imported chats for things they wanted. */
export async function POST(req: Request, ctx: Ctx) {
  return handle(async () => {
    await requireOwnerApi(req);
    return Response.json(await scanGifts(await entityId(ctx)));
  });
}
