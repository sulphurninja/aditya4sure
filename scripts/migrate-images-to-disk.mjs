// One-off: move photo/wallpaper bytes out of MongoDB into the encrypted on-disk store.
// node --env-file=.env.local scripts/migrate-images-to-disk.mjs
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { MongoClient } from "mongodb";

const key = Buffer.from(process.env.DATA_ENCRYPTION_KEY, "base64");
const ROOT = path.resolve(process.env.MEDIA_DIR ?? "private/media");

function decryptString(payload) {
  const [, iv, tag, ct] = payload.split(".");
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64")), d.final()]).toString("utf8");
}
function encryptBytes(plain) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]);
}
async function put(bucket, id, bytes) {
  const f = path.join(ROOT, bucket, id.slice(-2), `${id}.enc`);
  await mkdir(path.dirname(f), { recursive: true });
  await writeFile(f, encryptBytes(bytes));
}

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db(process.env.MONGODB_DB);
const before = await db.stats();

let media = 0;
for await (const d of db.collection("media").find({ imageCiphertext: { $type: "string" } })) {
  await put("media", d._id, Buffer.from(decryptString(d.imageCiphertext), "base64"));
  await db.collection("media").updateOne({ _id: d._id }, { $set: { hasImage: true }, $unset: { imageCiphertext: "" } });
  media++;
}
await db.collection("media").updateMany({ hasImage: { $exists: false } }, { $set: { hasImage: false } });
// stickers/documents are no longer kept at all
const dropped = await db.collection("media").deleteMany({ kind: { $in: ["sticker", "document"] } });
if (dropped.deletedCount) await db.collection("raw_messages").updateMany({ mediaId: { $ne: null }, kind: "media" }, [{ $set: { mediaId: "$mediaId" } }]);

let wps = 0;
for await (const w of db.collection("wallpapers").find({ ciphertext: { $type: "string" } })) {
  await put("wallpapers", w._id, Buffer.from(decryptString(w.ciphertext), "base64"));
  await db.collection("wallpapers").updateOne({ _id: w._id }, { $unset: { ciphertext: "" } });
  wps++;
}
await db.command({ compact: "media" }).catch(() => {});
const after = await db.stats();
console.log(`moved ${media} photos + ${wps} wallpapers to ${ROOT}; dropped ${dropped.deletedCount} sticker/doc rows`);
console.log(`db dataSize ${(before.dataSize / 1e6).toFixed(1)} MB -> ${(after.dataSize / 1e6).toFixed(1)} MB (storage ${(after.storageSize / 1e6).toFixed(1)} MB)`);
await client.close();
