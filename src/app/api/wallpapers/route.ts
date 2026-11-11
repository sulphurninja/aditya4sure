import { handle, HttpError, requireOwnerApi } from "@/lib/server/auth";
import { listWallpapers, saveWallpaper } from "@/lib/server/wallpapers";

export async function GET(req: Request) {
  return handle(async () => {
    await requireOwnerApi(req);
    return Response.json({ wallpapers: await listWallpapers() });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    await requireOwnerApi(req);
    if (Number(req.headers.get("content-length") ?? 0) > 5_000_000) throw new HttpError(413, "Image too large");
    return Response.json(await saveWallpaper(await req.json()), { status: 201 });
  });
}
