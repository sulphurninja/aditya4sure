"use client";

import type { ParsedMessage } from "./common";
import { matchAttachment, mediaKind, readZipEntry, type MediaKind, type ZipEntry } from "./zip";

const MAX_SIDE = 720;
const QUALITY = 0.72;

type Encoded = { dataUrl: string; width: number; height: number };

function drawToJpeg(src: CanvasImageSource, w: number, h: number): Encoded {
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  canvas.getContext("2d")!.drawImage(src, 0, 0, canvas.width, canvas.height);
  return { dataUrl: canvas.toDataURL("image/jpeg", QUALITY), width: canvas.width, height: canvas.height };
}

async function imageToJpeg(bytes: Uint8Array): Promise<Encoded> {
  const bmp = await createImageBitmap(new Blob([bytes as BlobPart]));
  try {
    return drawToJpeg(bmp, bmp.width, bmp.height);
  } finally {
    bmp.close();
  }
}

/** Grab one representative frame from a video, entirely in the browser. */
async function videoFrameToJpeg(bytes: Uint8Array): Promise<Encoded> {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "video/mp4" }));
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  try {
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("video timeout")), 12_000);
      video.onloadeddata = () => {
        video.currentTime = Math.min(1, (video.duration || 2) * 0.25);
      };
      video.onseeked = () => {
        clearTimeout(t);
        resolve();
      };
      video.onerror = () => {
        clearTimeout(t);
        reject(new Error("unsupported video"));
      };
      video.src = url;
    });
    return drawToJpeg(video, video.videoWidth, video.videoHeight);
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute("src");
  }
}

export type MediaPlanItem = { message: ParsedMessage; entry: ZipEntry; kind: MediaKind };

/** Which media messages actually have their file inside this export. */
export function planMedia(messages: ParsedMessage[], entries: ZipEntry[]): MediaPlanItem[] {
  const out: MediaPlanItem[] = [];
  for (const m of messages) {
    if (!m.attachment) continue;
    const entry = matchAttachment(entries, m.attachment);
    if (!entry) continue;
    const kind = mediaKind(entry.name);
    // stickers and files are skipped entirely (WhatsApp exports can hold thousands of stickers)
    if (kind !== "sticker" && kind !== "document") out.push({ message: m, entry, kind });
  }
  return out;
}

export function summarizePlan(plan: MediaPlanItem[]) {
  const by = (k: MediaKind) => plan.filter((p) => p.kind === k);
  const visual = [...by("image"), ...by("video")];
  return {
    photos: by("image").length,
    videos: by("video").length,
    voiceNotes: by("audio").length,
    stickers: by("sticker").length,
    documents: by("document").length,
    rawBytes: plan.reduce((n, p) => n + p.entry.size, 0),
    // ~60 KB per compressed photo / frame once stored
    estimatedStoredBytes: visual.length * 60_000,
  };
}

type Progress = { done: number; total: number; stored: number; failed: number };

/** Compress and upload the media for an already-imported thread. Resumable and idempotent. */
export async function uploadMedia(
  file: Blob,
  threadId: string,
  plan: MediaPlanItem[],
  opts: { includeVisual: boolean; onProgress: (p: Progress) => void; signal?: AbortSignal },
) {
  const p: Progress = { done: 0, total: plan.length, stored: 0, failed: 0 };
  let batch: Record<string, unknown>[] = [];
  let batchBytes = 0;

  const flush = async () => {
    if (!batch.length) return;
    const res = await fetch(`/api/threads/${threadId}/media`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: batch }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error ?? "Media upload failed");
    p.stored += d.stored ?? 0;
    batch = [];
    batchBytes = 0;
  };

  for (const item of plan) {
    if (opts.signal?.aborted) break;
    const { message: m, entry, kind } = item;
    const base = { at: m.at, sender: m.sender, text: m.text, dup: m.dup, attachment: m.attachment!, kind };
    let payload: Record<string, unknown> = base;
    if (opts.includeVisual && (kind === "image" || kind === "video")) {
      try {
        const bytes = await readZipEntry(file, entry, 120_000_000);
        const enc = kind === "image" ? await imageToJpeg(bytes) : await videoFrameToJpeg(bytes);
        payload = { ...base, ...enc };
        batchBytes += enc.dataUrl.length;
      } catch {
        p.failed++;
      }
    }
    batch.push(payload);
    p.done++;
    if (batch.length >= 40 || batchBytes > 1_200_000) await flush();
    if (p.done % 5 === 0 || p.done === p.total) opts.onProgress({ ...p });
  }
  await flush();
  opts.onProgress({ ...p });
  return p;
}
