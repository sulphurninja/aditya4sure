import { handle, requireOwnerApi } from "@/lib/server/auth";
import { elevenQuota, voiceConfig, voiceUsage } from "@/lib/server/voice-io";

export async function GET(req: Request) {
  return handle(async () => {
    await requireOwnerApi(req);
    const [usage, quota] = await Promise.all([voiceUsage(), elevenQuota()]);
    return Response.json({ enabled: Boolean(voiceConfig().key), usage, quota }, { headers: { "Cache-Control": "no-store" } });
  });
}
