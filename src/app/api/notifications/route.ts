import { handle, requireOwnerApi } from "@/lib/server/auth";
import { recentNotifications } from "@/lib/server/reminders";

export async function GET(req: Request) {
  return handle(async () => {
    await requireOwnerApi(req);
    return Response.json({ notifications: await recentNotifications(30) }, { headers: { "Cache-Control": "no-store" } });
  });
}
