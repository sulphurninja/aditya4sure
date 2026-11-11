/**
 * Import a WhatsApp "Export chat" zip (with or without media) through the app's API.
 *   npx tsx --env-file=.env.local scripts/import-whatsapp.mts "<export.zip>"
 * Photos are resized and stored encrypted on local disk (never in MongoDB).
 * Stickers and documents are skipped; voice notes are kept as markers. Re-running never duplicates.
 */
import { openAsBlob } from "node:fs";
import sharp from "sharp";
import { guessSelf } from "@/lib/importers/common";
import { parseWhatsApp } from "@/lib/importers/whatsapp";
import { listZip, matchAttachment, mediaKind, readZipEntry, readZipText } from "@/lib/importers/zip";

const BASE = process.env.APP_URL ?? "http://localhost:3000";
const zipPath = process.argv[2];
if (!zipPath) throw new Error("usage: import-whatsapp.mts <export.zip>");
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

let cookie = "";
async function api<T = Record<string, unknown>>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(BASE + path, { method, headers: { "Content-Type": "application/json", Origin: BASE, Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${(d as { error?: string }).error ?? ""}`);
  return d as T;
}
{
  const r = await fetch(BASE + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json", Origin: BASE }, body: JSON.stringify({ passphrase: process.env.OWNER_PASSPHRASE }) });
  if (!r.ok) throw new Error(`login failed (${r.status})`);
  cookie = (r.headers.get("set-cookie") ?? "").split(";")[0];
}

const blob = await openAsBlob(zipPath);
const entries = await listZip(blob);
const chat = entries.find((e) => /(^|\/)(_chat|WhatsApp Chat[^/]*)\.txt$/i.test(e.name)) ?? entries.find((e) => /\.txt$/i.test(e.name));
if (!chat) throw new Error("no chat .txt in zip");
const t = parseWhatsApp(await readZipText(blob, chat), { fileName: zipPath.split(/[\\/]/).pop() });
const self = guessSelf(t.participants, ["Aditya", "Aditya Pingle", "aditya4sure", "sulphurninja"]);
log(`parsed "${t.title}": ${t.messages.length} messages, participants ${t.participants.join(" / ")}, you = "${self}"`, t.warnings);

const { thread, existed } = await api<{ thread: { _id: string; messageCount: number }; existed: boolean }>("POST", "/api/threads", {
  source: "whatsapp",
  title: t.title,
  participants: t.participants,
  selfName: self,
  consent: true,
});
const complete = existed && thread.messageCount >= t.messages.length;
let inserted = 0;
for (let k = 0; !complete && k < t.messages.length; k += 2000) {
  const r = await api<{ inserted: number }>("POST", `/api/threads/${thread._id}/messages`, { messages: t.messages.slice(k, k + 2000) });
  inserted += r.inserted;
  log(`messages ${Math.min(k + 2000, t.messages.length)}/${t.messages.length} (+${inserted})`);
}
if (!complete) await api("POST", `/api/threads/${thread._id}/finalize`);

let stored = 0;
let batch: Record<string, unknown>[] = [];
let bytes = 0;
const flush = async () => {
  if (!batch.length) return;
  stored += (await api<{ stored: number }>("POST", `/api/threads/${thread._id}/media`, { items: batch })).stored;
  batch = [];
  bytes = 0;
};
for (const m of t.messages) {
  if (!m.attachment) continue;
  const entry = matchAttachment(entries, m.attachment);
  if (!entry) continue;
  const kind = mediaKind(entry.name);
  if (kind !== "image" && kind !== "audio") continue; // stickers/docs skipped; videos need the in-app importer for frames
  const base = { at: m.at, sender: m.sender, text: m.text, dup: m.dup, attachment: m.attachment, kind };
  if (kind === "image") {
    try {
      const out = await sharp(Buffer.from(await readZipEntry(blob, entry)))
        .rotate()
        .resize({ width: 720, height: 720, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 72 })
        .toBuffer({ resolveWithObject: true });
      const dataUrl = `data:image/jpeg;base64,${out.data.toString("base64")}`;
      batch.push({ ...base, dataUrl, width: out.info.width, height: out.info.height });
      bytes += dataUrl.length;
    } catch {
      continue;
    }
  } else batch.push(base);
  if (batch.length >= 40 || bytes > 1_200_000) await flush();
}
await flush();
log(`done: thread ${thread._id} ${existed ? "(merged)" : "(new)"}, +${inserted} messages, +${stored} photos/voice markers`);
console.log(`THREAD_ID=${thread._id}`);
