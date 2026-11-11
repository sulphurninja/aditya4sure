import { handle, requireOwnerApi } from "@/lib/server/auth";
import { testPing } from "@/lib/server/reminders";

/** Sends a sample reminder right now, to check WhatsApp + voice notes end to end. */
export async function POST(req: Request) {
  return handle(async () => {
    await requireOwnerApi(req);
    return Response.json({ notification: await testPing() });
  });
}
