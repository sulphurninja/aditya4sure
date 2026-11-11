import { handle, HttpError, requireOwnerApi } from "@/lib/server/auth";
import { loadMediaImage } from "@/lib/server/media";

/** Decrypted photo / video frame, for the signed-in owner only. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireOwnerApi(req);
    const img = await loadMediaImage((await params).id);
    if (!img) throw new HttpError(404, "Not found");
    return new Response(new Uint8Array(img), {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=604800, immutable", "X-Content-Type-Options": "nosniff" },
    });
  });
}
