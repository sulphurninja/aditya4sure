import { handle, HttpError, requireOwnerApi } from "@/lib/server/auth";
import { deleteWallpaper, loadWallpaper } from "@/lib/server/wallpapers";

type Ctx = { params: Promise<{ id: string }> };

/** Serves a decrypted wallpaper to the signed-in owner only. */
export async function GET(req: Request, { params }: Ctx) {
  return handle(async () => {
    await requireOwnerApi(req);
    const wp = await loadWallpaper((await params).id);
    if (!wp) throw new HttpError(404, "Not found");
    return new Response(new Uint8Array(wp.bytes), {
      headers: { "Content-Type": wp.mime, "Cache-Control": "private, max-age=604800, immutable", "X-Content-Type-Options": "nosniff" },
    });
  });
}

export async function DELETE(req: Request, { params }: Ctx) {
  return handle(async () => {
    await requireOwnerApi(req);
    await deleteWallpaper((await params).id);
    return Response.json({ ok: true });
  });
}
