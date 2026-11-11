import { z } from "zod";
import { handle, requireOwnerApi } from "@/lib/server/auth";
import { latestRhythms, runRhythm } from "@/lib/server/rhythm";

export const maxDuration = 300;

export async function GET(req: Request) {
  return handle(async () => {
    await requireOwnerApi(req);
    return Response.json({ entries: await latestRhythms(10) });
  });
}

/** "Run now" from the Today page: generate (and optionally WhatsApp) a brief / wrap-up / review on demand. */
export async function POST(req: Request) {
  return handle(async () => {
    await requireOwnerApi(req);
    const { kind, send } = z.object({ kind: z.enum(["morning", "night", "weekly", "monthly"]), send: z.boolean().default(false) }).parse(await req.json());
    return Response.json({ entry: await runRhythm(kind, { send }) });
  });
}
