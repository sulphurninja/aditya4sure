/**
 * One-time: copy the encrypted files from private/media to the Vercel Blob store (private).
 * Files are uploaded byte-for-byte (already AES-GCM encrypted), same pathnames the app uses.
 * Skips files already in Blob, so it's safe to re-run.
 *   BLOB_READ_WRITE_TOKEN=... node scripts/migrate-media-to-blob.mjs
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { head, put } from "@vercel/blob";

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error("set BLOB_READ_WRITE_TOKEN first");
  process.exit(1);
}
const ROOT = path.resolve(process.env.MEDIA_DIR ?? "private/media");

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.name.endsWith(".enc")) yield p;
  }
}

let up = 0;
let skip = 0;
const queue = [];
for await (const file of walk(ROOT)) queue.push(file);
console.log(`${queue.length} files`);
const worker = async () => {
  for (;;) {
    const file = queue.pop();
    if (!file) return;
    const key = path.relative(ROOT, file).split(path.sep).join("/");
    try {
      await head(key);
      skip++;
      continue;
    } catch {
      /* not there yet */
    }
    await put(key, await readFile(file), { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/octet-stream", cacheControlMaxAge: key.startsWith("threads/") ? 60 : 31536000 });
    up++;
    if (up % 50 === 0) console.log(`uploaded ${up}`);
  }
};
await Promise.all(Array.from({ length: 8 }, worker));
console.log(`done: ${up} uploaded, ${skip} already there`);
