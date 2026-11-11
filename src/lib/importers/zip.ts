import { inflateSync } from "fflate";

/**
 * Random-access ZIP reader for the browser (works on any Blob/File).
 * Reads the central directory, then slices out only the entries we need,
 * so a 700 MB export never has to sit in memory. Supports ZIP64.
 */

export type ZipEntry = { name: string; method: number; compSize: number; size: number; offset: number };

const SIG_EOCD = 0x06054b50;
const SIG_Z64_LOC = 0x07064b50;
const SIG_CEN = 0x02014b50;
const SIG_LOC = 0x04034b50;

async function bytes(file: Blob, start: number, end: number) {
  return new DataView(await file.slice(start, end).arrayBuffer());
}

const u64 = (v: DataView, o: number) => Number(v.getBigUint64(o, true));

export async function listZip(file: Blob): Promise<ZipEntry[]> {
  const tailStart = Math.max(0, file.size - (65_535 + 22 + 20));
  const tail = await bytes(file, tailStart, file.size);
  let eocd = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) === SIG_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("That doesn't look like a zip file.");

  let count = tail.getUint16(eocd + 10, true);
  let cdSize = tail.getUint32(eocd + 12, true);
  let cdOffset = tail.getUint32(eocd + 16, true);

  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    const loc = eocd - 20;
    if (loc < 0 || tail.getUint32(loc, true) !== SIG_Z64_LOC) throw new Error("Broken ZIP64 archive.");
    const z64Offset = u64(tail, loc + 8);
    const z = await bytes(file, z64Offset, z64Offset + 56);
    count = u64(z, 32);
    cdSize = u64(z, 40);
    cdOffset = u64(z, 48);
  }

  const cd = await bytes(file, cdOffset, cdOffset + cdSize);
  const dec = new TextDecoder("utf-8");
  const out: ZipEntry[] = [];
  let p = 0;
  for (let n = 0; n < count && p + 46 <= cd.byteLength; n++) {
    if (cd.getUint32(p, true) !== SIG_CEN) break;
    const method = cd.getUint16(p + 10, true);
    let compSize = cd.getUint32(p + 20, true);
    let size = cd.getUint32(p + 24, true);
    const nameLen = cd.getUint16(p + 28, true);
    const extraLen = cd.getUint16(p + 30, true);
    const commentLen = cd.getUint16(p + 32, true);
    let offset = cd.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nameLen));
    // ZIP64 extra field carries the real sizes/offset when the 32-bit ones overflow.
    let e = p + 46 + nameLen;
    const extraEnd = e + extraLen;
    while (e + 4 <= extraEnd) {
      const id = cd.getUint16(e, true);
      const len = cd.getUint16(e + 2, true);
      if (id === 0x0001) {
        let q = e + 4;
        if (size === 0xffffffff) {
          size = u64(cd, q);
          q += 8;
        }
        if (compSize === 0xffffffff) {
          compSize = u64(cd, q);
          q += 8;
        }
        if (offset === 0xffffffff) offset = u64(cd, q);
      }
      e += 4 + len;
    }
    if (!name.endsWith("/") && !name.includes("..")) out.push({ name, method, compSize, size, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

export async function readZipEntry(file: Blob, e: ZipEntry, maxBytes = 200_000_000): Promise<Uint8Array> {
  if (e.size > maxBytes) throw new Error(`${e.name} is too large`);
  const h = await bytes(file, e.offset, e.offset + 30);
  if (h.getUint32(0, true) !== SIG_LOC) throw new Error(`Corrupt entry ${e.name}`);
  const start = e.offset + 30 + h.getUint16(26, true) + h.getUint16(28, true);
  const data = new Uint8Array(await file.slice(start, start + e.compSize).arrayBuffer());
  if (e.method === 0) return data;
  if (e.method === 8) return inflateSync(data, { out: new Uint8Array(e.size) });
  throw new Error(`Unsupported compression in ${e.name}`);
}

export async function readZipText(file: Blob, e: ZipEntry) {
  return new TextDecoder("utf-8").decode(await readZipEntry(file, e));
}

export type MediaKind = "image" | "video" | "audio" | "sticker" | "document";

/** Classify an attachment by file name (WhatsApp + Instagram conventions). */
export function mediaKind(name: string): MediaKind {
  const base = name.split("/").pop() ?? name;
  if (/^STK-/i.test(base) || /sticker/i.test(base)) return "sticker";
  if (/\.(jpe?g|png|heic|gif)$/i.test(base)) return "image";
  if (/\.webp$/i.test(base)) return /^IMG-/i.test(base) ? "image" : "sticker";
  if (/\.(mp4|3gp|mov|m4v|webm)$/i.test(base)) return "video";
  if (/\.(opus|ogg|m4a|mp3|aac|amr|wav)$/i.test(base)) return "audio";
  return "document";
}

/** Find the zip entry an attachment reference points to (exact path, then by file name). */
export function matchAttachment(entries: ZipEntry[], ref: string): ZipEntry | undefined {
  const clean = ref.replace(/^\/+/, "");
  const base = clean.split("/").pop()!;
  return entries.find((e) => e.name === clean) ?? entries.find((e) => e.name.endsWith("/" + clean)) ?? entries.find((e) => e.name.split("/").pop() === base);
}
