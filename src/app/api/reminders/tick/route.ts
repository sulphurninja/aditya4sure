import { safeEqual } from "@/lib/server/crypto";
import { dispatchDueReminders } from "@/lib/server/reminders";
import { runDueRhythms } from "@/lib/server/rhythm";

export const maxDuration = 300;

/**
 * Fires due reminders. Two callers, each with its own secret:
 *   - Vercel Cron (every minute, see vercel.json): GET with "Authorization: Bearer <CRON_SECRET>"
 *   - the local in-process timer (src/instrumentation.ts): POST with "x-tick-secret: <MCP_TOKEN>"
 */
function authorized(req: Request) {
  const cron = process.env.CRON_SECRET;
  const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
  if (cron && bearer && safeEqual(bearer, cron)) return true;
  const local = process.env.MCP_TOKEN;
  const given = req.headers.get("x-tick-secret") ?? "";
  return Boolean(local && given && safeEqual(given, local));
}

async function tick(req: Request) {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    const [reminders, rhythm] = await Promise.all([dispatchDueReminders(), runDueRhythms().catch(() => ({ fired: [] as string[] }))]);
    return Response.json({ ...reminders, rhythm: rhythm.fired });
  } catch (err) {
    console.error("[tick] failed:", err instanceof Error ? err.message.slice(0, 160) : "unknown");
    return Response.json({ error: "tick failed" }, { status: 500 });
  }
}

export { tick as GET, tick as POST };
