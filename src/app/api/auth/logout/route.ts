import { cookies } from "next/headers";
import { assertSameOrigin, handle } from "@/lib/server/auth";
import { SESSION_COOKIE } from "@/lib/server/session-token";

export async function POST() {
  return handle(async () => {
    await assertSameOrigin();
    (await cookies()).delete(SESSION_COOKIE);
    return Response.json({ ok: true });
  });
}
