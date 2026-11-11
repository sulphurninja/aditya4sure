import "server-only";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { del, get, head, put } from "@vercel/blob";
import { decryptBytes, encryptBytes } from "./crypto";

/**
 * Files (chat photos, wallpapers, chat-search copies, voice notes) never go in MongoDB.
 * Everything is AES-256-GCM encrypted HERE, before it leaves the process, so storage only ever holds ciphertext.
 *
 * Backends (same 4 functions either way, swap for S3 later by adding one more):
 *   - Vercel Blob, private store, when BLOB_READ_WRITE_TOKEN is set (production on Vercel)
 *   - local disk under MEDIA_DIR or private/media (git-ignored) otherwise
 */
type Bucket = "media" | "wallpapers" | "threads" | "voice";

const ROOT = path.resolve(process.cwd(), process.env.MEDIA_DIR ?? "private/media");
const blobBackend = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

/** Same layout on disk and in Blob: <bucket>/<last 2 chars>/<id>.enc */
function key(bucket: Bucket, id: string) {
  if (!/^[a-z]{2,4}_[a-f0-9]{16,32}$/.test(id)) throw new Error("bad blob id");
  return `${bucket}/${id.slice(-2)}/${id}.enc`;
}

/** Overwritten in place (chat-search copies), so always read the latest, not a cached copy. */
const mutable = (bucket: Bucket) => bucket === "threads";

export async function putBlob(bucket: Bucket, id: string, bytes: Uint8Array) {
  const k = key(bucket, id);
  const sealed = encryptBytes(bytes);
  if (blobBackend()) {
    await put(k, sealed, { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/octet-stream", cacheControlMaxAge: mutable(bucket) ? 60 : 31_536_000 });
    return;
  }
  const f = path.join(ROOT, k);
  await mkdir(path.dirname(f), { recursive: true });
  await writeFile(f, sealed);
}

export async function getBlob(bucket: Bucket, id: string): Promise<Buffer | null> {
  try {
    const k = key(bucket, id);
    if (blobBackend()) {
      const res = await get(k, { access: "private", useCache: !mutable(bucket) });
      if (!res) return null;
      return decryptBytes(Buffer.from(await new Response(res.stream).arrayBuffer()));
    }
    return decryptBytes(await readFile(path.join(ROOT, k)));
  } catch {
    return null;
  }
}

export async function hasBlob(bucket: Bucket, id: string) {
  try {
    const k = key(bucket, id);
    if (blobBackend()) {
      await head(k);
      return true;
    }
    await stat(path.join(ROOT, k));
    return true;
  } catch {
    return false;
  }
}

export async function deleteBlob(bucket: Bucket, id: string) {
  const k = key(bucket, id);
  if (blobBackend()) {
    await del(k).catch(() => {});
    return;
  }
  await rm(path.join(ROOT, k), { force: true });
}
