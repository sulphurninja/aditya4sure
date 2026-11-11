import "server-only";
import { z } from "zod";
import {
  OWNER_ID,
  ParsedMessageSchema,
  ThreadCreateInput,
  ThreadPatchInput,
  type ImportedThread,
  type MediaInfo,
  type StoredMedia,
  type StoredRawMessage,
  type ThreadMessage,
} from "@/lib/domain";
import { mediaKind as kindOf } from "@/lib/importers/zip";
import { mediaCaption } from "@/lib/importers/whatsapp";
import { detectEntities } from "@/lib/seed/registry";
import { audit } from "./audit";
import { gunzipSync, gzipSync } from "node:zlib";
import { deleteBlob, getBlob, putBlob } from "./blob-store";
import { HttpError } from "./auth";
import { decrypt, encrypt, sha256 } from "./crypto";
import { collections, newId, nowIso } from "./db";

const MAX_THREAD_MESSAGES = 200_000;

export function mediaInfo(d: StoredMedia): MediaInfo {
  let parsed: { description?: string; tags?: string[]; visibleText?: string | null } = {};
  if (d.analysisCiphertext) {
    try {
      parsed = JSON.parse(decrypt(d.analysisCiphertext));
    } catch {
      parsed = {};
    }
  }
  return { id: d._id, kind: d.kind, status: d.status, description: parsed.description ?? null, tags: parsed.tags ?? [], visibleText: parsed.visibleText ?? null };
}

/** Content-derived message id. The media upload uses the same formula to find its message. */
export function messageIdFor(threadId: string, m: { at: string; sender: string; text: string; dup: number }) {
  const at = new Date(m.at).toISOString();
  return `msg_${sha256([threadId, at, m.sender, m.text, String(m.dup)].join("\u0000")).slice(0, 32)}`;
}

function threadKey(source: string, title: string, participants: string[], externalId?: string) {
  if (externalId) return sha256([source, "id", externalId].join("\u0000")).slice(0, 32);
  return sha256([source, title.toLowerCase().trim(), ...[...participants].map((p) => p.toLowerCase().trim()).sort()].join("\u0000")).slice(0, 32);
}

/** Create the thread record (or return the existing one, re-imports merge into it). */
export async function createOrGetThread(raw: unknown): Promise<{ thread: ImportedThread; existed: boolean }> {
  const input = ThreadCreateInput.parse(raw);
  const c = await collections();
  const key = threadKey(input.source, input.title, input.participants, input.externalId);
  const existing = await c.threads.findOne({ ownerId: OWNER_ID, key });
  if (existing) {
    if (input.selfName && existing.selfName !== input.selfName) {
      await c.threads.updateOne({ _id: existing._id }, { $set: { selfName: input.selfName, updatedAt: nowIso() } });
      existing.selfName = input.selfName;
    }
    return { thread: existing, existed: true };
  }
  const others = input.participants.filter((p) => p !== input.selfName);
  // ChatGPT conversations aren't "with" a person; who wrote them is decided by the author check.
  const entityId = input.source === "chatgpt" ? null : (detectEntities([input.title, ...others].join(" ")).find((e) => e !== "person:aditya") ?? null);
  const now = nowIso();
  const thread: ImportedThread = {
    _id: newId("thr"),
    ownerId: OWNER_ID,
    source: input.source,
    key,
    title: input.title,
    participants: input.participants,
    selfName: input.selfName,
    entityId,
    messageCount: 0,
    selfCount: 0,
    firstAt: null,
    lastAt: null,
    wallpaper: entityId === "person:komal" ? { kind: "preset", id: "hearts" } : { kind: "preset", id: "aurora" },
    consentAt: now,
    createdAt: now,
    updatedAt: now,
  };
  await c.threads.insertOne(thread);
  await audit({ actor: "owner", action: "thread.create", targetType: "thread", targetId: thread._id, note: `${input.source} · consent given` });
  return { thread, existed: false };
}

const BatchInput = z.object({ messages: z.array(ParsedMessageSchema).min(1).max(2500) });

/** Encrypt and upsert a batch. Message ids are content-derived, so re-imports never duplicate. */
export async function appendMessages(threadId: string, raw: unknown): Promise<{ inserted: number; duplicates: number }> {
  const { messages } = BatchInput.parse(raw);
  const c = await collections();
  const thread = await c.threads.findOne({ _id: threadId, ownerId: OWNER_ID });
  if (!thread) throw new HttpError(404, "Thread not found");
  if (thread.messageCount + messages.length > MAX_THREAD_MESSAGES) throw new HttpError(413, "Thread too large");

  const ops = messages.map((m) => {
    const at = new Date(m.at).toISOString();
    const _id = messageIdFor(threadId, m);
    const doc: StoredRawMessage = {
      _id,
      ownerId: OWNER_ID,
      threadId,
      at,
      sender: m.sender,
      kind: m.kind,
      edited: m.edited,
      textCiphertext: encrypt(m.text),
      length: m.text.length,
      attachment: m.attachment ?? null,
      mediaId: null,
    };
    const { _id: id, ...rest } = doc;
    return { updateOne: { filter: { _id: id, ownerId: OWNER_ID }, update: { $setOnInsert: rest }, upsert: true } };
  });
  const res = await c.rawMessages.bulkWrite(ops, { ordered: false });
  return { inserted: res.upsertedCount, duplicates: messages.length - res.upsertedCount };
}

/** Recompute counters after an import. */
export async function finalizeThread(threadId: string) {
  const c = await collections();
  const thread = await c.threads.findOne({ _id: threadId, ownerId: OWNER_ID });
  if (!thread) throw new HttpError(404, "Thread not found");
  const [stats] = await c.rawMessages
    .aggregate<{ n: number; first: string; last: string }>([
      { $match: { ownerId: OWNER_ID, threadId } },
      { $group: { _id: null, n: { $sum: 1 }, first: { $min: "$at" }, last: { $max: "$at" } } },
    ])
    .toArray();
  const selfCount = thread.selfName ? await c.rawMessages.countDocuments({ ownerId: OWNER_ID, threadId, sender: thread.selfName }) : 0;
  await c.threads.updateOne(
    { _id: threadId },
    { $set: { messageCount: stats?.n ?? 0, selfCount, firstAt: stats?.first ?? null, lastAt: stats?.last ?? null, updatedAt: nowIso() } },
  );
  invalidateThreadCache(threadId);
  await audit({ actor: "owner", action: "thread.import", targetType: "thread", targetId: threadId, note: `${stats?.n ?? 0} messages stored (encrypted)` });
  return { messageCount: stats?.n ?? 0, selfCount };
}

function toPlain(thread: ImportedThread, m: StoredRawMessage): ThreadMessage {
  let text = "";
  try {
    text = decrypt(m.textCiphertext);
  } catch {
    text = "[unreadable, did the encryption key change?]";
  }
  return {
    _id: m._id,
    threadId: m.threadId,
    at: m.at,
    sender: m.sender,
    kind: m.kind,
    edited: m.edited,
    length: m.length,
    attachment: m.attachment ?? null,
    mediaId: m.mediaId ?? null,
    text,
    isSelf: m.sender === thread.selfName,
  };
}

/** Attach decrypted media info (kind, Claude's description) to messages that have it. */
async function withMedia(messages: ThreadMessage[]): Promise<ThreadMessage[]> {
  const ids = messages.map((m) => m.mediaId).filter((x): x is string => Boolean(x));
  if (!ids.length) return messages;
  const c = await collections();
  const docs = await c.media.find({ ownerId: OWNER_ID, _id: { $in: ids } }, { projection: { imageCiphertext: 0 } }).toArray();
  const byId = new Map(docs.map((d) => [d._id, mediaInfo(d)]));
  return messages.map((m) => (m.mediaId ? { ...m, media: byId.get(m.mediaId) ?? null } : m));
}

/** WhatsApp / Instagram chats. ChatGPT conversations (hundreds) live on their own screen. */
export async function listThreads(opts: { source?: "chatgpt" | "chats" } = {}) {
  const c = await collections();
  const source = opts.source === "chatgpt" ? "chatgpt" : { $ne: "chatgpt" as const };
  return c.threads.find({ ownerId: OWNER_ID, source }).sort({ lastAt: -1 }).toArray();
}

export async function getThread(id: string) {
  const c = await collections();
  return c.threads.findOne({ _id: id, ownerId: OWNER_ID });
}

/** Newest-first page, returned oldest-first for rendering. */
export async function threadMessages(threadId: string, opts: { before?: string; limit?: number } = {}) {
  const c = await collections();
  const thread = await c.threads.findOne({ _id: threadId, ownerId: OWNER_ID });
  if (!thread) throw new HttpError(404, "Thread not found");
  const limit = Math.min(opts.limit ?? 300, 1000);
  const rows = await c.rawMessages
    .find({ ownerId: OWNER_ID, threadId, ...(opts.before ? { at: { $lt: opts.before } } : {}) })
    .sort({ at: -1, _id: -1 })
    .limit(limit)
    .toArray();
  return { thread, messages: await withMedia(rows.reverse().map((m) => toPlain(thread, m))), hasMore: rows.length === limit };
}

// Decrypted threads stay in server memory briefly so repeat questions don't re-read 80k rows from Atlas.
// Process memory only, never written anywhere. Invalidated when the thread changes.
const threadCache = new Map<string, { stamp: string; at: number; data: { thread: ImportedThread; messages: ThreadMessage[] } }>();
const CACHE_MS = 10 * 60_000;

export function invalidateThreadCache(threadId?: string) {
  if (threadId) threadCache.delete(threadId);
  else threadCache.clear();
}

/** Load and decrypt a whole thread (bounded), for search, voice and learning. */
/**
 * Whole-chat reads from Atlas free tier crawl (~100 KB/s, minutes for a big chat), so each chat keeps an
 * encrypted local copy (private/media/threads). Rebuilt automatically whenever the chat changes.
 */
async function diskOrFetch(thread: ImportedThread): Promise<ThreadMessage[]> {
  const stamp = `${thread.updatedAt}|${thread.messageCount}|${thread.selfName}`;
  const disk = await getBlob("threads", thread._id);
  if (disk) {
    try {
      const parsed = JSON.parse(gunzipSync(disk).toString("utf8")) as { stamp: string; messages: ThreadMessage[] };
      if (parsed.stamp === stamp) return parsed.messages;
    } catch {
      /* corrupt or old format, rebuild below */
    }
  }
  const c = await collections();
  // Parallel time slices: Atlas serves several cursors at once much faster than one long one.
  const from = Date.parse(thread.firstAt ?? "2000-01-01");
  const to = Date.parse(thread.lastAt ?? new Date().toISOString());
  const SLICES = 8;
  const edges = Array.from({ length: SLICES - 1 }, (_, i) => new Date(from + ((to - from) * (i + 1)) / SLICES).toISOString());
  const parts = await Promise.all(
    Array.from({ length: SLICES }, (_, i) => {
      const at: Record<string, string> = {};
      if (i > 0) at.$gte = edges[i - 1];
      if (i < SLICES - 1) at.$lt = edges[i];
      return c.rawMessages
        .find({ ownerId: OWNER_ID, threadId: thread._id, ...(Object.keys(at).length ? { at } : {}) }, { projection: { ownerId: 0 } })
        .toArray();
    }),
  );
  const rows = parts.flat().sort((a, b) => a.at.localeCompare(b.at) || a._id.localeCompare(b._id));
  const messages = rows.map((m) => toPlain(thread, m));
  await putBlob("threads", thread._id, gzipSync(Buffer.from(JSON.stringify({ stamp, messages })))).catch(() => {});
  return messages;
}

export async function allThreadMessages(threadId: string, cap = 120_000): Promise<{ thread: ImportedThread; messages: ThreadMessage[] }> {
  const c = await collections();
  const thread = await c.threads.findOne({ _id: threadId, ownerId: OWNER_ID });
  if (!thread) throw new HttpError(404, "Thread not found");
  const stamp = `${thread.updatedAt}|${thread.messageCount}|${thread.selfName}`;
  const hit = threadCache.get(threadId);
  if (hit && hit.stamp === stamp && Date.now() - hit.at < CACHE_MS) return hit.data;
  const data = { thread, messages: await withMedia((await diskOrFetch(thread)).slice(-cap)) };
  threadCache.set(threadId, { stamp, at: Date.now(), data });
  if (threadCache.size > 8) threadCache.delete(threadCache.keys().next().value!);
  return data;
}

/** Messages from several threads in a time window, decrypted, oldest first (indexed range query). */
export async function messagesInRange(threadIds: string[], from: string, to: string) {
  const c = await collections();
  const threads = await c.threads.find({ ownerId: OWNER_ID, _id: { $in: threadIds } }).toArray();
  const byId = new Map(threads.map((t) => [t._id, t]));
  const rows = await c.rawMessages
    .find({ ownerId: OWNER_ID, threadId: { $in: threadIds }, at: { $gte: from, $lte: to }, kind: { $ne: "system" } })
    .sort({ at: 1 })
    .toArray();
  const plain = rows.map((m) => toPlain(byId.get(m.threadId)!, m));
  return { threads, messages: await withMedia(plain) };
}

/** Just the latest N messages of a thread (cheap indexed read), oldest first. */
export async function recentThreadMessages(threadId: string, n = 40) {
  const c = await collections();
  const thread = await c.threads.findOne({ _id: threadId, ownerId: OWNER_ID });
  if (!thread) return [];
  const rows = await c.rawMessages.find({ ownerId: OWNER_ID, threadId, kind: { $ne: "system" } }).sort({ at: -1 }).limit(n).toArray();
  return withMedia(rows.reverse().map((m) => toPlain(thread, m)));
}

/** Imported chats linked to any of these people (e.g. all of Komal's WhatsApp + Instagram threads). */
export async function threadsForEntities(entityIds: string[]) {
  if (!entityIds.length) return [];
  const c = await collections();
  return c.threads.find({ ownerId: OWNER_ID, entityId: { $in: entityIds } }).sort({ messageCount: -1 }).limit(5).toArray();
}

/** Text the model should see for a message: photo descriptions included. */
export function contextText(m: ThreadMessage): string {
  if (m.kind !== "media") return m.text;
  const caption = mediaCaption(m.text);
  const kind = m.media?.kind ?? (m.attachment ? kindOf(m.attachment) : "media");
  const desc = m.media?.description ? `: ${m.media.description}${m.media.visibleText ? ` (text in it: "${m.media.visibleText}")` : ""}` : "";
  return `[${kind}${desc}]${caption && !/omitted|^<|^null$/i.test(caption) ? ` ${caption}` : ""}`;
}

export async function patchThread(id: string, raw: unknown) {
  const input = ThreadPatchInput.parse(raw);
  const c = await collections();
  const set = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
  const res = await c.threads.findOneAndUpdate({ _id: id, ownerId: OWNER_ID }, { $set: { ...set, updatedAt: nowIso() } }, { returnDocument: "after" });
  if (!res) throw new HttpError(404, "Thread not found");
  invalidateThreadCache(id);
  if (input.selfName !== undefined) await finalizeThread(id);
  await audit({ actor: "owner", action: "thread.update", targetType: "thread", targetId: id, changedFields: Object.keys(set) });
  return res;
}

/** Deletes the thread, every stored message, voice samples and pending proposals derived from it. */
export async function deleteThread(id: string) {
  const c = await collections();
  const thread = await c.threads.findOne({ _id: id, ownerId: OWNER_ID });
  if (!thread) throw new HttpError(404, "Thread not found");
  const [msgs, samples, props] = await Promise.all([
    c.rawMessages.deleteMany({ ownerId: OWNER_ID, threadId: id }),
    c.styleSamples.deleteMany({ ownerId: OWNER_ID, sourceThreadId: id }),
    c.proposals.deleteMany({ ownerId: OWNER_ID, sourceConversationId: `thread:${id}`, status: "pending" }),
  ]);
  const mediaIds = await c.media.find({ ownerId: OWNER_ID, threadId: id }, { projection: { _id: 1 } }).map((d) => d._id).toArray();
  await Promise.all([...mediaIds.map((mid) => deleteBlob("media", mid)), deleteBlob("threads", id)]);
  await c.media.deleteMany({ ownerId: OWNER_ID, threadId: id });
  await c.conversations.updateMany({ ownerId: OWNER_ID, threadId: id }, { $set: { threadId: null } });
  await c.threads.deleteOne({ _id: id, ownerId: OWNER_ID });
  invalidateThreadCache(id);
  await audit({ actor: "owner", action: "thread.delete", targetType: "thread", targetId: id, note: `${msgs.deletedCount} messages, ${samples.deletedCount} voice samples, ${props.deletedCount} proposals removed` });
  return { messages: msgs.deletedCount, samples: samples.deletedCount };
}

/** Pick representative messages Aditya wrote and save them as voice samples for a mode. */
export async function voiceFromThread(id: string, mode: "personal" | "professional" | "affectionate" | "creative", count = 24) {
  const { thread, messages } = await allThreadMessages(id);
  if (!thread.selfName) throw new HttpError(400, "Pick which participant is you first");
  const mine = messages.filter((m) => m.isSelf && m.kind === "text" && m.text.length >= 12 && m.text.length <= 400 && !/https?:\/\//.test(m.text));
  if (!mine.length) throw new HttpError(400, "No usable messages from you in this chat");
  // spread across the whole history, prefer slightly longer messages
  const step = Math.max(1, Math.floor(mine.length / (count * 2)));
  const pool = mine.filter((_, i) => i % step === 0).sort((a, b) => b.text.length - a.text.length).slice(0, count * 2);
  const picked = pool.sort(() => 0.5 - Math.random()).slice(0, count);
  const c = await collections();
  const existing = new Set((await c.styleSamples.find({ ownerId: OWNER_ID, mode }).project<{ text: string }>({ text: 1 }).toArray()).map((s) => s.text));
  const docs = picked
    .filter((m) => !existing.has(m.text))
    .map((m) => ({
      _id: newId("style"),
      ownerId: OWNER_ID,
      mode,
      text: m.text,
      context: `${thread.source} chat · ${thread.title}`,
      audience: thread.participants.filter((p) => p !== thread.selfName).join(", ").slice(0, 120) || null,
      authoredBy: "aditya" as const,
      sourceThreadId: id,
      createdAt: nowIso(),
    }));
  if (docs.length) await c.styleSamples.insertMany(docs);
  await audit({ actor: "owner", action: "style.from_thread", targetType: "thread", targetId: id, note: `${docs.length} samples → ${mode}` });
  return { added: docs.length };
}

const STOP = new Set("the a an and or to of in on for is are was were be i me my you your we it that this what when where how did do does with about from at as so ki ka ke hai tha aur ko se".split(" "));

/** Keyword search inside one thread with surrounding context, fed to Claude as chat excerpts. */
export async function searchThread(id: string, query: string, maxHits = 10, recent = 25) {
  const { thread, messages } = await allThreadMessages(id);
  const terms = [...new Set(query.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 2 && !STOP.has(t)))];
  const scored = messages
    .map((m, i) => {
      const hay = contextText(m).toLowerCase();
      return { i, score: m.kind === "text" || m.media?.description ? terms.reduce((s, t) => s + (hay.includes(t) ? 1 : 0), 0) : 0 };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxHits);
  const windows = new Set<number>();
  for (const h of scored) for (let k = Math.max(0, h.i - 3); k <= Math.min(messages.length - 1, h.i + 3); k++) windows.add(k);
  // Always include the most recent stretch so "lately"/"recently" questions work.
  for (let k = Math.max(0, messages.length - recent); k < messages.length; k++) windows.add(k);
  const lines = [...windows].sort((a, b) => a - b).map((k) => messages[k]);
  return { thread, lines, hits: scored.length };
}
