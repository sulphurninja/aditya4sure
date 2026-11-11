import { handle, HttpError, requireOwnerApi } from "@/lib/server/auth";
import { importConversations } from "@/lib/server/chatgpt";

export const maxDuration = 300;

/** A batch of parsed ChatGPT conversations (parsed in the browser from the export zip). */
export async function POST(req: Request) {
  return handle(async () => {
    await requireOwnerApi(req);
    if (Number(req.headers.get("content-length") ?? 0) > 4_400_000) throw new HttpError(413, "Batch too large");
    return Response.json(await importConversations(await req.json()));
  });
}
