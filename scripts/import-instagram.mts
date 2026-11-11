/**
 * Import a full Instagram "Download your information" export into ADITYA through the app's own API.
 *
 *   npx tsx --env-file=.env.local scripts/import-instagram.mts <export.zip> [steps]
 *
 * steps (default: account,dms): account | dms | describe | learn | voice | all
 * Requires the app running on http://localhost:3000 (npm run dev).
 * Re-running is safe: messages, photos and facts are deduplicated.
 */
import { openAsBlob } from "node:fs";
import sharp from "sharp";
import { buildAccountFacts, ACCOUNT_FILES, type DmSummary } from "@/lib/importers/instagram-account";
import { IG_MESSAGE_FILE, parseInstagram } from "@/lib/importers/instagram";
import type { ParsedThread } from "@/lib/importers/common";
import { listZip, matchAttachment, mediaKind, readZipEntry, readZipText, type ZipEntry } from "@/lib/importers/zip";

const BASE = process.env.APP_URL ?? "http://localhost:3000";
const [zipPath, stepArg = "account,dms"] = process.argv.slice(2);
if (!zipPath) throw new Error("usage: import-instagram.mts <export.zip> [steps]");
const steps = new Set(stepArg === "all" ? ["account", "dms", "describe", "learn", "voice"] : stepArg.split(","));
const exportedAt = /(\d{4}-\d{2}-\d{2})/.exec(zipPath)?.[1] ?? new Date().toISOString().slice(0, 10);

let cookie = "";
async function api<T = Record<string, unknown>>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  const r = await fetch(BASE + path, { method, headers: { "Content-Type": "application/json", Origin: BASE, Cookie: cookie, ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let d: unknown;
  try {
    d = JSON.parse(text);
  } catch {
    d = { error: text.slice(0, 200) };
  }
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${(d as { error?: string }).error ?? ""}`);
  return d as T;
}

const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ---------- login ----------
{
  const r = await fetch(BASE + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json", Origin: BASE }, body: JSON.stringify({ passphrase: process.env.OWNER_PASSPHRASE }) });
  if (!r.ok) throw new Error(`login failed (${r.status}) — is the app running at ${BASE}?`);
  cookie = (r.headers.get("set-cookie") ?? "").split(";")[0];
}

const blob = await openAsBlob(zipPath);
const entries = await listZip(blob);
log(`zip: ${entries.length} entries`);

// ---------- parse DMs (inbox only; message requests from strangers are skipped) ----------
const byFolder = new Map<string, ZipEntry[]>();
for (const e of entries) {
  const m = IG_MESSAGE_FILE.exec(e.name);
  if (!m || m[1] !== "inbox") continue;
  const key = m[2];
  byFolder.set(key, [...(byFolder.get(key) ?? []), e]);
}
const threads: { folder: string; t: ParsedThread }[] = [];
for (const [folder, files] of byFolder) {
  const texts = await Promise.all(files.sort((a, b) => a.name.localeCompare(b.name)).map((f) => readZipText(blob, f)));
  threads.push({ folder, t: parseInstagram(texts) });
}
// You're the one sender who shows up in (almost) every conversation.
const presence = new Map<string, number>();
for (const { t } of threads) for (const p of new Set(t.messages.map((m) => m.sender))) presence.set(p, (presence.get(p) ?? 0) + 1);
const selfName = [...presence.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
threads.sort((a, b) => b.t.messages.length - a.t.messages.length);
log(`DMs: ${threads.length} conversations, ${threads.reduce((n, x) => n + x.t.messages.length, 0)} messages, you = "${selfName}"`);

const dmSummaries: DmSummary[] = threads.map(({ t }) => ({
  title: t.title,
  count: t.messages.filter((m) => m.kind !== "system").length,
  selfCount: t.messages.filter((m) => m.sender === selfName).length,
  firstAt: t.messages[0]?.at ?? null,
  lastAt: t.messages[t.messages.length - 1]?.at ?? null,
}));

// ---------- account facts ----------
if (steps.has("account")) {
  const files = new Map<string, unknown>();
  for (const e of entries.filter((x) => ACCOUNT_FILES.test(x.name))) {
    const text = await readZipText(blob, e);
    try {
      files.set(e.name, e.name.endsWith(".srt") ? text : JSON.parse(text));
    } catch {
      /* skip unreadable */
    }
  }
  const { facts, username, displayName } = buildAccountFacts(files, { exportedAt, dms: dmSummaries });
  log(`account: ${files.size} files → ${facts.length} facts (@${username})`);
  const res = await api("POST", "/api/imports/instagram-account", { exportedAt, username, displayName, facts });
  log("account facts:", res);
}

// ---------- DMs + photos ----------
const imported: { id: string; title: string; count: number; selfCount: number; photos: number }[] = [];
if (steps.has("dms")) {
  for (const [i, { folder, t }] of threads.entries()) {
    if (!t.messages.length) continue;
    const { thread, existed } = await api<{ thread: { _id: string; messageCount: number }; existed: boolean }>("POST", "/api/threads", {
      source: "instagram",
      title: t.title.slice(0, 160),
      participants: (t.participants.length ? t.participants : [...new Set(t.messages.map((m) => m.sender))]).slice(0, 300),
      selfName,
      consent: true,
    });
    let inserted = 0;
    // already fully imported? skip re-sending (Atlas free tier counts every write)
    const complete = existed && thread.messageCount >= t.messages.length;
    for (let k = 0; !complete && k < t.messages.length; k += 2000) {
      const r = await api<{ inserted: number }>("POST", `/api/threads/${thread._id}/messages`, { messages: t.messages.slice(k, k + 2000) });
      inserted += r.inserted;
    }
    if (!complete) await api("POST", `/api/threads/${thread._id}/finalize`);

    // photos (resized here) + voice-note markers. Videos are left for the in-app importer, which grabs frames in the browser.
    let photos = 0;
    let batch: Record<string, unknown>[] = [];
    let bytes = 0;
    const flush = async () => {
      if (!batch.length) return;
      const r = await api<{ stored: number }>("POST", `/api/threads/${thread._id}/media`, { items: batch });
      photos += r.stored;
      batch = [];
      bytes = 0;
    };
    for (const m of t.messages) {
      if (!m.attachment) continue;
      const entry = matchAttachment(entries, m.attachment);
      if (!entry) continue;
      const kind = mediaKind(entry.name);
      if (kind === "video" || kind === "sticker" || kind === "document") continue;
      const base = { at: m.at, sender: m.sender, text: m.text, dup: m.dup, attachment: m.attachment, kind };
      if (kind === "image") {
        try {
          const buf = Buffer.from(await readZipEntry(blob, entry));
          const out = await sharp(buf).rotate().resize({ width: 720, height: 720, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 72 }).toBuffer({ resolveWithObject: true });
          const dataUrl = `data:image/jpeg;base64,${out.data.toString("base64")}`;
          batch.push({ ...base, dataUrl, width: out.info.width, height: out.info.height });
          bytes += dataUrl.length;
        } catch {
          /* unreadable image */
        }
      } else batch.push(base);
      if (batch.length >= 40 || bytes > 1_200_000) await flush();
    }
    await flush();
    imported.push({ id: thread._id, title: t.title, count: t.messages.length, selfCount: t.messages.filter((m) => m.sender === selfName).length, photos });
    log(`[${i + 1}/${threads.length}] ${folder.slice(0, 28).padEnd(28)} ${existed ? "merged" : "new   "} +${inserted} msgs, +${photos} media`);
  }
}

// helpers for later steps
async function threadList() {
  const { threads: list } = await api<{ threads: { _id: string; title: string; source: string; messageCount: number; selfCount: number }[] }>("GET", "/api/threads");
  return list.filter((x) => x.source === "instagram").sort((a, b) => b.messageCount - a.messageCount);
}

// ---------- describe photos with Claude vision ----------
if (steps.has("describe")) {
  let done = 0;
  for (const th of await threadList()) {
    for (;;) {
      const r = await api<{ analyzed: number; failed: number; remaining: number }>("POST", `/api/threads/${th._id}/media/analyze`, { limit: 6 });
      done += r.analyzed;
      if (r.remaining === 0 || r.analyzed + r.failed === 0) break;
    }
  }
  log(`described ${done} photos`);
}

// ---------- learn memories from the biggest conversations ----------
if (steps.has("learn")) {
  const top = (await threadList()).filter((x) => x.selfCount >= 30).slice(0, 12);
  for (const th of top) {
    try {
      const r = await api<{ created: number }>("POST", `/api/threads/${th._id}/learn`, { window: 600 });
      log(`learn ${th.title.slice(0, 30).padEnd(30)} → ${r.created} proposals`);
    } catch (e) {
      log(`learn ${th.title} failed: ${(e as Error).message}`);
    }
  }
}

// ---------- teach voice from your own texts ----------
if (steps.has("voice")) {
  const top = (await threadList()).filter((x) => x.selfCount >= 50).slice(0, 8);
  for (const th of top) {
    const mode = /komal/i.test(th.title) ? "affectionate" : "personal";
    try {
      const r = await api<{ added: number }>("POST", `/api/threads/${th._id}/voice`, { mode, count: mode === "affectionate" ? 30 : 12 });
      log(`voice ${th.title.slice(0, 30).padEnd(30)} → +${r.added} ${mode} samples`);
    } catch (e) {
      log(`voice ${th.title} failed: ${(e as Error).message}`);
    }
  }
}
log("done");
