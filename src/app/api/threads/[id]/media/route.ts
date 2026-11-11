import { handle, HttpError, requireOwnerApi } from "@/lib/server/auth";
import { mediaStats, saveMediaBatch } from "@/lib/server/media";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  return handle(async () => {
    await requireOwnerApi(req);
    return Response.json(await mediaStats((await params).id), { headers: { "Cache-Control": "no-store" } });
  });
}

/** Upload a batch of downscaled photos / video frames (or metadata for voice notes & stickers). */
export async function POST(req: Request, { params }: Ctx) {
  return handle(async () => {
    await requireOwnerApi(req);
    if (Number(req.headers.get("content-length") ?? 0) > 4_400_000) throw new HttpError(413, "Batch too large");
    return Response.json(await saveMediaBatch((await params).id, await req.json()));
  });
}
