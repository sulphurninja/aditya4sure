/**
 * In-process scheduler: once a minute, ask the app to fire due reminders.
 * It only pings our own tick route (which holds all the logic), so nothing server-only is imported here.
 * Runs wherever `next dev` / `next start` runs: your laptop now, the VPS later.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // On Vercel there is no long-running process; Vercel Cron calls the tick route instead (vercel.json).
  if (process.env.VERCEL) return;
  const g = globalThis as typeof globalThis & { __adityaTick?: ReturnType<typeof setInterval> };
  if (g.__adityaTick) return;
  const secret = process.env.MCP_TOKEN;
  if (!secret) {
    console.warn("[scheduler] MCP_TOKEN not set, reminders won't fire");
    return;
  }
  const port = process.env.PORT || "3000";
  const tick = () =>
    fetch(`http://127.0.0.1:${port}/api/reminders/tick`, { method: "POST", headers: { "x-tick-secret": secret } })
      .then(async (r) => {
        if (!r.ok) return;
        const j = (await r.json().catch(() => ({}))) as { fired?: number };
        if (j.fired) console.log(`[scheduler] fired ${j.fired} reminder(s)`);
      })
      .catch(() => {
        /* server still booting */
      });
  g.__adityaTick = setInterval(tick, 60_000);
  setTimeout(tick, 15_000);
}
