import { handle, requireOwnerApi } from "@/lib/server/auth";
import { getVoicePrefs, listVoices, TTS_MODELS } from "@/lib/server/voice-io";

export async function GET(req: Request) {
  return handle(async () => {
    await requireOwnerApi(req);
    const [voices, prefs] = await Promise.all([listVoices(), getVoicePrefs()]);
    return Response.json({ voices, models: TTS_MODELS, prefs });
  });
}
