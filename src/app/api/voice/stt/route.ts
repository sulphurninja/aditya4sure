import { handle, HttpError, requireOwnerApi } from "@/lib/server/auth";
import { transcribe } from "@/lib/server/voice-io";

/** Audio from the mic (webm/opus or mp4) -> text. Max ~45 s / 3 MB. */
export async function POST(req: Request) {
  return handle(async () => {
    await requireOwnerApi(req);
    if (Number(req.headers.get("content-length") ?? 0) > 3_500_000) throw new HttpError(413, "too long, keep it under 45 seconds");
    const form = await req.formData();
    const audio = form.get("audio");
    const seconds = Math.min(60, Math.max(0, Number(form.get("seconds") ?? 0)));
    if (!(audio instanceof Blob) || audio.size < 1000) throw new HttpError(400, "didn't catch any audio");
    if (!/^audio\/|^video\/webm/.test(audio.type || "audio/webm")) throw new HttpError(415, "that's not audio");
    return Response.json(await transcribe(audio, seconds));
  });
}
