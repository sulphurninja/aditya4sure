import { z } from "zod";
import { handle, requireOwnerApi } from "@/lib/server/auth";
import { speak } from "@/lib/server/voice-io";

/** One sentence (or a few) of the answer -> mp3 stream. The client calls this per sentence as the reply streams in. */
export async function POST(req: Request) {
  return handle(async () => {
    await requireOwnerApi(req);
    const { text } = z.object({ text: z.string().trim().min(1).max(800) }).parse(await req.json());
    return speak(text);
  });
}
