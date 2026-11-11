import { z } from "zod";
import { handle, requireOwnerApi } from "@/lib/server/auth";
import { setVoicePrefs } from "@/lib/server/voice-io";

export async function POST(req: Request) {
  return handle(async () => {
    await requireOwnerApi(req);
    const body = z
      .object({
        voiceId: z.string().max(40).optional(),
        model: z.string().max(60).optional(),
        style: z.enum(["expressive", "natural"]).optional(),
        gender: z.enum(["female", "male", "neutral"]).optional(),
      })
      .parse(await req.json());
    return Response.json({ prefs: await setVoicePrefs(body) });
  });
}
