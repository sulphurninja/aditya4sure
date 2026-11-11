import "server-only";
import { z } from "zod";
import { OWNER_ID } from "@/lib/domain";
import { audit } from "./audit";
import { HttpError } from "./auth";
import { deleteBlob, getBlob, putBlob } from "./blob-store";
import { collections, nowIso, type WallpaperBlob } from "./db";

const MAX_BYTES = 3 * 1024 * 1024;

const Upload = z.object({
  dataUrl: z.string().max(Math.ceil(MAX_BYTES * 1.4)).regex(/^data:image\/(jpeg|webp|png);base64,[A-Za-z0-9+/=]+$/),
});

function sniff(buf: Buffer): WallpaperBlob["mime"] | null {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

export async function saveWallpaper(raw: unknown): Promise<{ id: string }> {
  const { dataUrl } = Upload.parse(raw);
  const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const buf = Buffer.from(b64, "base64");
  if (buf.length > MAX_BYTES) throw new HttpError(413, "Image too large (max 3 MB after resize)");
  const mime = sniff(buf);
  if (!mime) throw new HttpError(415, "Only JPEG, PNG or WebP images");
  const id = `wp_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const c = await collections();
  await putBlob("wallpapers", id, buf);
  await c.wallpapers.insertOne({ _id: id, ownerId: OWNER_ID, mime, bytes: buf.length, createdAt: nowIso() });
  await audit({ actor: "owner", action: "wallpaper.upload", targetType: "wallpaper", targetId: id });
  return { id };
}

export async function loadWallpaper(id: string): Promise<{ mime: string; bytes: Buffer } | null> {
  if (!/^wp_[a-f0-9]{16}$/.test(id)) return null;
  const c = await collections();
  const doc = await c.wallpapers.findOne({ _id: id, ownerId: OWNER_ID });
  if (!doc) return null;
  const bytes = await getBlob("wallpapers", id);
  return bytes ? { mime: doc.mime, bytes } : null;
}

export async function listWallpapers() {
  const c = await collections();
  return c.wallpapers.find({ ownerId: OWNER_ID }, { projection: { ciphertext: 0 } }).sort({ createdAt: -1 }).limit(30).toArray();
}

export async function deleteWallpaper(id: string) {
  const c = await collections();
  await c.wallpapers.deleteOne({ _id: id, ownerId: OWNER_ID });
  await deleteBlob("wallpapers", id);
  const none = { kind: "none" as const };
  await c.conversations.updateMany({ ownerId: OWNER_ID, "wallpaper.id": id }, { $set: { wallpaper: none } });
  await c.threads.updateMany({ ownerId: OWNER_ID, "wallpaper.id": id }, { $set: { wallpaper: none } });
  await audit({ actor: "owner", action: "wallpaper.delete", targetType: "wallpaper", targetId: id });
}
