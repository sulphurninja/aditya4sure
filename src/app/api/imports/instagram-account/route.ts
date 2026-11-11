import { handle, HttpError, requireOwnerApi } from "@/lib/server/auth";
import { importInstagramAccount } from "@/lib/server/instagram";

/** Account-level facts parsed (in the browser) from an Instagram data export. */
export async function POST(req: Request) {
  return handle(async () => {
    await requireOwnerApi(req);
    if (Number(req.headers.get("content-length") ?? 0) > 4_000_000) throw new HttpError(413, "Too large");
    return Response.json(await importInstagramAccount(await req.json()));
  });
}
