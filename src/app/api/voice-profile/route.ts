import { handle, requireOwnerApi } from "@/lib/server/auth";
import { getVoiceProfile, rebuildVoiceProfile } from "@/lib/server/voice";

export const maxDuration = 300;

export async function GET(req: Request) {
  return handle(async () => {
    await requireOwnerApi(req);
    return Response.json({ profile: await getVoiceProfile() });
  });
}

/** Re-learn how you text from your imported chats. */
export async function POST(req: Request) {
  return handle(async () => {
    await requireOwnerApi(req);
    return Response.json(await rebuildVoiceProfile());
  });
}
