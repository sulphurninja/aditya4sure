import { handle, HttpError, requireOwnerApi } from "@/lib/server/auth";
import { appendMessages, threadMessages } from "@/lib/server/threads";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  return handle(async () => {
    await requireOwnerApi(req);
    const sp = new URL(req.url).searchParams;
    const before = sp.get("before") ?? undefined;
    if (before && Number.isNaN(Date.parse(before))) throw new HttpError(400, "Bad cursor");
    const { messages, hasMore } = await threadMessages((await params).id, { before, limit: Number(sp.get("limit") ?? 300) });
    return Response.json({ messages, hasMore }, { headers: { "Cache-Control": "no-store" } });
  });
}

/** Append one batch (≤ 2,500) of parsed messages. Text is encrypted before it touches the database. */
export async function POST(req: Request, { params }: Ctx) {
  return handle(async () => {
    await requireOwnerApi(req);
    const len = Number(req.headers.get("content-length") ?? 0);
    if (len > 4_400_000) throw new HttpError(413, "Batch too large");
    return Response.json(await appendMessages((await params).id, await req.json()));
  });
}
