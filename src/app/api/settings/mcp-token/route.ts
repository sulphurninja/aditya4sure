import { handle, HttpError, requireOwnerApi } from "@/lib/server/auth";
import { env } from "@/lib/server/env";

/** Lets the signed-in owner copy the MCP secret from Settings. Never rendered into pages by default. */
export async function GET(req: Request) {
  return handle(async () => {
    await requireOwnerApi(req);
    const token = env().MCP_TOKEN;
    if (!token) throw new HttpError(404, "MCP_TOKEN not set");
    return Response.json({ token }, { headers: { "Cache-Control": "no-store" } });
  });
}
