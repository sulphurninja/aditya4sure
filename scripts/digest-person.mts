/**
 * Pre-digest every imported chat with a person into first-hand memories.
 *   npx tsx --env-file=.env.local scripts/digest-person.mts person:komal
 * Resumable: re-running skips chunks already done (pass --fresh to re-plan).
 */
const BASE = process.env.APP_URL ?? "http://localhost:3000";
const entityId = process.argv[2] ?? "person:komal";
const fresh = process.argv.includes("--fresh");
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

let cookie = "";
async function api<T = Record<string, unknown>>(body: unknown): Promise<T> {
  const r = await fetch(BASE + "/api/digest", { method: "POST", headers: { "Content-Type": "application/json", Origin: BASE, Cookie: cookie }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${r.status} ${(d as { error?: string }).error ?? ""}`);
  return d as T;
}
{
  const r = await fetch(BASE + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json", Origin: BASE }, body: JSON.stringify({ passphrase: process.env.OWNER_PASSPHRASE }) });
  cookie = (r.headers.get("set-cookie") ?? "").split(";")[0];
}

let status = await api<{ chunks: number; pending: number[]; overviewAt: string | null } | null>({ action: "status", entityId });
if (!status || fresh) {
  const plan = await api({ action: "plan", entityId });
  log("planned", plan);
  status = await api({ action: "status", entityId });
}
const queue = [...status!.pending];
log(`${queue.length} of ${status!.chunks} chunks to digest`);

async function worker() {
  for (;;) {
    const i = queue.shift();
    if (i === undefined) return;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const r = await api<{ period: string; messages: number; saved: number; moments: number; facts: number }>({ action: "chunk", entityId, index: i });
        log(`chunk ${i} ${r.period} · ${r.messages} msgs → ${r.moments} moments, ${r.facts} facts`);
        break;
      } catch (e) {
        log(`chunk ${i} attempt ${attempt} failed: ${(e as Error).message}`);
      }
    }
  }
}
await Promise.all([worker(), worker(), worker()]);
log("overview…");
log("overview", await api({ action: "overview", entityId }));
log("done");
