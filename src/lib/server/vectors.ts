import "server-only";
import { createHash } from "node:crypto";
import { OWNER_ID, type Memory } from "@/lib/domain";
import { collections } from "./db";
import { embed, embeddingsReady, EMBED_MODEL } from "./llm";
import { getDb } from "./mongo";

/**
 * Semantic recall: every active memory gets a 512-d meaning vector (OpenAI text-embedding-3-small),
 * stored in its own collection so memory documents stay small. Search is a cosine scan in memory
 * (a few thousand vectors is ~1 ms), cached for a few minutes. No Atlas vector index required.
 */

type Vec = { _id: string; ownerId: string; v: number[]; hash: string; model: string; at: string };

async function vecCol() {
  return (await getDb()).collection<Vec>("memory_vectors");
}

const hashOf = (m: Pick<Memory, "statement">) => createHash("sha1").update(m.statement).digest("hex").slice(0, 16);

/** What gets embedded: the fact plus a little context so "Komal" / "Zaptick" / dates help matching. */
const textOf = (m: Memory) => `${m.statement}${m.tags?.length ? ` (${m.tags.slice(0, 5).join(", ")})` : ""}${m.eventAt ? ` [${m.eventAt}]` : ""}`;

let cache: { at: number; ids: string[]; vecs: Float32Array[] } | null = null;

export function invalidateVectorCache() {
  cache = null;
}

/** Embed memories that have no (or a stale) vector. Called from the minute tick in small batches. */
export async function syncVectors(batch = 200): Promise<{ embedded: number; removed: number }> {
  if (!embeddingsReady()) return { embedded: 0, removed: 0 };
  const { memories } = await collections();
  const col = await vecCol();
  const active = await memories.find({ ownerId: OWNER_ID, status: "active" }, { projection: { _id: 1, statement: 1, tags: 1, eventAt: 1 } }).toArray();
  const have = new Map((await col.find({ ownerId: OWNER_ID }, { projection: { _id: 1, hash: 1 } }).toArray()).map((v) => [v._id, v.hash]));
  const todo = active.filter((m) => have.get(m._id) !== hashOf(m)).slice(0, batch) as Memory[];
  // Vectors of memories that were deleted / superseded go too.
  const activeIds = new Set(active.map((m) => m._id));
  const stale = [...have.keys()].filter((id) => !activeIds.has(id));
  if (stale.length) await col.deleteMany({ _id: { $in: stale } });
  let embedded = 0;
  for (let i = 0; i < todo.length; i += 100) {
    const chunk = todo.slice(i, i + 100);
    const vecs = await embed(chunk.map(textOf));
    if (!vecs) break;
    const at = new Date().toISOString();
    await col.bulkWrite(
      chunk.map((m, k) => ({
        updateOne: { filter: { _id: m._id }, update: { $set: { ownerId: OWNER_ID, v: vecs[k], hash: hashOf(m), model: EMBED_MODEL, at } }, upsert: true },
      })),
    );
    embedded += chunk.length;
  }
  if (embedded || stale.length) cache = null;
  return { embedded, removed: stale.length };
}

async function loadAll() {
  if (cache && Date.now() - cache.at < 5 * 60_000) return cache;
  const rows = await (await vecCol()).find({ ownerId: OWNER_ID }).toArray();
  cache = { at: Date.now(), ids: rows.map((r) => r._id), vecs: rows.map((r) => Float32Array.from(r.v)) };
  return cache;
}

function cosine(a: Float32Array, b: Float32Array) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

/** Memories closest in meaning to the query: [{ id, score 0..1 }]. Empty if embeddings are off. */
export async function semanticSearch(query: string, k = 30): Promise<{ id: string; score: number }[]> {
  if (!embeddingsReady() || query.trim().length < 3) return [];
  const [q, all] = await Promise.all([embed([query]), loadAll()]);
  if (!q || !all.ids.length) return [];
  const qv = Float32Array.from(q[0]);
  const scored = all.ids.map((id, i) => ({ id, score: cosine(qv, all.vecs[i]) }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}

export async function vectorStats() {
  const { memories } = await collections();
  const [total, withVec] = await Promise.all([memories.countDocuments({ ownerId: OWNER_ID, status: "active" }), (await vecCol()).countDocuments({ ownerId: OWNER_ID })]);
  return { total, withVec };
}
