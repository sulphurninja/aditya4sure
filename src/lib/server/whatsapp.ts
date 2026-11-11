import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { safeEqual } from "./crypto";
import { putBlob } from "./blob-store";

/**
 * WhatsApp via Aditya's own Zaptick account (WABA). Messages go only to HIS number (OWNER_WHATSAPP),
 * never to anyone else. Free-form text/audio needs the 24h window open (he messaged the business number
 * in the last 24h); outside it Zaptick rejects and the reminder stays in the app.
 */

const API = "https://zaptick.io/api";

export function whatsappConfig() {
  return {
    key: process.env.ZAPTICK_API_KEY || null,
    /** His personal WhatsApp number, E.164, e.g. +919876543210. */
    to: process.env.OWNER_WHATSAPP || null,
    /** Public https base of this app (needed so WhatsApp can fetch voice-note audio). */
    publicUrl: (process.env.PUBLIC_URL || "").replace(/\/$/, "") || null,
  };
}

export function whatsappReady() {
  const c = whatsappConfig();
  return Boolean(c.key && c.to);
}

export function voiceNotesReady() {
  const c = whatsappConfig();
  return whatsappReady() && Boolean(c.publicUrl?.startsWith("https://")) && Boolean(process.env.ELEVENLABS_API_KEY);
}

export type SendResult = { ok: true; id: string | null } | { ok: false; reason: "off" | "window_closed" | "error"; detail: string };

async function post(path: string, body: unknown): Promise<SendResult> {
  const { key } = whatsappConfig();
  if (!key) return { ok: false, reason: "off", detail: "ZAPTICK_API_KEY not set" };
  try {
    const res = await fetch(`${API}${path}`, {
      method: "POST",
      headers: { "X-API-Key": key, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.ok) {
      const id = (j.messageId ?? j.wamid ?? (j.data as Record<string, unknown> | undefined)?.messageId ?? null) as string | null;
      return { ok: true, id };
    }
    const msg = String(j.error ?? j.message ?? `HTTP ${res.status}`);
    if (/24[- ]?hour|window/i.test(msg)) return { ok: false, reason: "window_closed", detail: msg.slice(0, 200) };
    return { ok: false, reason: "error", detail: msg.slice(0, 200) };
  } catch (err) {
    return { ok: false, reason: "error", detail: err instanceof Error ? err.message.slice(0, 200) : "network error" };
  }
}

/** Plain text to his WhatsApp (24h window). */
export async function sendWhatsAppText(message: string): Promise<SendResult> {
  const { to } = whatsappConfig();
  if (!to) return { ok: false, reason: "off", detail: "OWNER_WHATSAPP not set" };
  return post("/send-text", { phone: to, message: message.slice(0, 4000) });
}

/* ---------- voice notes: audio served from a signed, expiring public link ---------- */

function secret() {
  return process.env.SESSION_SECRET || process.env.MCP_TOKEN || "";
}

export function signVoiceId(id: string, expires: number) {
  return createHmac("sha256", secret()).update(`${id}.${expires}`).digest("base64url").slice(0, 32);
}

export function verifyVoiceToken(id: string, expires: number, sig: string) {
  if (!secret() || !/^vn_[a-f0-9]{24}$/.test(id) || !Number.isFinite(expires) || expires < Date.now()) return false;
  return safeEqual(sig, signVoiceId(id, expires));
}

/** Store the mp3 (encrypted on disk) and return a public URL WhatsApp can fetch for the next 24h. */
export async function publishVoiceNote(mp3: Uint8Array): Promise<string | null> {
  const { publicUrl } = whatsappConfig();
  if (!publicUrl) return null;
  const id = `vn_${randomBytes(12).toString("hex")}`;
  await putBlob("voice", id, mp3);
  const expires = Date.now() + 24 * 60 * 60 * 1000;
  return `${publicUrl}/api/public/voice/${id}.mp3?e=${expires}&s=${signVoiceId(id, expires)}`;
}

export async function sendWhatsAppAudio(link: string): Promise<SendResult> {
  const { to } = whatsappConfig();
  if (!to) return { ok: false, reason: "off", detail: "OWNER_WHATSAPP not set" };
  return post("/messages", { to: to.replace(/^\+/, ""), type: "audio", audio: { link } });
}
