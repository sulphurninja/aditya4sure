import "server-only";
import { OWNER_ID } from "@/lib/domain";
import { z } from "zod";
import { isHinglish } from "@/lib/language";
import { HttpError } from "./auth";
import { llmInfo, parseJson } from "./llm";
import { getDb } from "./mongo";

/**
 * ElevenLabs = ears (Scribe speech-to-text) and mouth (Flash text-to-speech) for voice mode.
 * The brain itself still answers through the normal chat pipeline. Key stays server-side.
 * Every character spoken and second heard is metered per month, with a hard cap.
 */

const API = "https://api.elevenlabs.io/v1";

export function voiceConfig() {
  return {
    key: process.env.ELEVENLABS_API_KEY || null,
    // Default: "Will" (relaxed, young), a premade voice. Picked in /talk, stored in voice_prefs.
    voiceId: process.env.ELEVENLABS_VOICE_ID || "bIHbv24MWmeRgasZH58o",
    ttsModel: process.env.ELEVENLABS_TTS_MODEL || "eleven_v3_conversational",
    sttModel: process.env.ELEVENLABS_STT_MODEL || "scribe_v1",
    /** Characters of speech per calendar month before voice replies stop (text still works). */
    charCap: Number(process.env.VOICE_MONTHLY_CHAR_CAP || 150_000),
    /** Minutes of listening per month. */
    sttMinuteCap: Number(process.env.VOICE_MONTHLY_STT_MINUTES || 300),
  };
}

type Usage = { _id: string; ownerId: string; month: string; ttsChars: number; ttsCalls: number; sttSeconds: number; sttCalls: number; updatedAt: string };

function month() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }).slice(0, 7);
}

async function usageCol() {
  return (await getDb()).collection<Usage>("voice_usage");
}

export async function voiceUsage() {
  const m = month();
  const u = await (await usageCol()).findOne({ _id: `${OWNER_ID}:${m}` });
  const cfg = voiceConfig();
  return {
    month: m,
    ttsChars: u?.ttsChars ?? 0,
    sttMinutes: Math.round(((u?.sttSeconds ?? 0) / 60) * 10) / 10,
    ttsCalls: u?.ttsCalls ?? 0,
    sttCalls: u?.sttCalls ?? 0,
    charCap: cfg.charCap,
    sttMinuteCap: cfg.sttMinuteCap,
  };
}

async function meter(inc: Partial<Pick<Usage, "ttsChars" | "ttsCalls" | "sttSeconds" | "sttCalls">>) {
  const m = month();
  await (await usageCol()).updateOne(
    { _id: `${OWNER_ID}:${m}` },
    { $inc: inc, $set: { ownerId: OWNER_ID, month: m, updatedAt: new Date().toISOString() } },
    { upsert: true },
  );
}

function requireKey() {
  const { key } = voiceConfig();
  if (!key) throw new HttpError(503, "voice is off, add ELEVENLABS_API_KEY to .env.local");
  return key;
}

async function elevenError(res: Response): Promise<never> {
  let detail = "";
  try {
    const j = (await res.json()) as { detail?: { message?: string; status?: string } | string };
    detail = typeof j.detail === "string" ? j.detail : (j.detail?.message ?? j.detail?.status ?? "");
  } catch {
    /* ignore */
  }
  if (res.status === 401) throw new HttpError(502, "ElevenLabs rejected the API key");
  if (res.status === 429) throw new HttpError(429, "ElevenLabs is rate limiting, give it a sec");
  if (/quota|credits/i.test(detail)) throw new HttpError(402, "out of ElevenLabs credits for this month");
  throw new HttpError(502, `ElevenLabs error ${res.status}${detail ? `: ${detail.slice(0, 160)}` : ""}`);
}

/** Speech -> text. `seconds` is the client-measured recording length (for metering + cap). */
export async function transcribe(audio: Blob, seconds: number): Promise<{ text: string; language: string | null }> {
  const key = requireKey();
  const cfg = voiceConfig();
  const used = await voiceUsage();
  if (used.sttMinutes >= cfg.sttMinuteCap) throw new HttpError(402, `listening cap for ${used.month} reached (${cfg.sttMinuteCap} min). raise VOICE_MONTHLY_STT_MINUTES if you want more`);
  const form = new FormData();
  form.append("model_id", cfg.sttModel);
  form.append("file", audio, "speech.webm");
  form.append("tag_audio_events", "false");
  const res = await fetch(`${API}/speech-to-text`, { method: "POST", headers: { "xi-api-key": key }, body: form });
  if (!res.ok) await elevenError(res);
  const data = (await res.json()) as { text?: string; language_code?: string };
  await meter({ sttSeconds: Math.max(1, Math.round(seconds)), sttCalls: 1 });
  return { text: (data.text ?? "").trim(), language: data.language_code ?? null };
}

/** Clean model output into something worth saying out loud. */
export function speakable(text: string): string {
  return text
    .replace(/\[(M\d+(?:\s*,\s*M\d+)*)\]/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*_`#>~]+/g, "")
    .replace(/\p{Extended_Pictographic}|\u{FE0F}|\u{200D}/gu, "")
    .replace(/₹\s?/g, "rupees ")
    .replace(/\s+/g, " ")
    .trim();
}

/* ---------------- voice + model he picked in /talk ---------------- */

/** Models offered in the picker. v3/v4 understand emotion tags like [laughs]. Cost is ElevenLabs credits per character. */
export const TTS_MODELS = [
  { id: "eleven_v3_conversational", label: "v3 conversational", note: "most expressive for back-and-forth, emotion tags, fast", cost: 0.5, tags: true },
  { id: "eleven_v4_turbo", label: "v4 turbo", note: "newest, natural, emotion tags", cost: 0.5, tags: true },
  { id: "eleven_v3", label: "v3", note: "max drama and range, slower", cost: 1, tags: true },
  { id: "eleven_flash_v2_5", label: "flash", note: "fastest and plainest", cost: 0.5, tags: false },
] as const;

/** style: expressive = ElevenLabs "creative" stability (more emotion, a bit less predictable). gender drives Hindi grammar ("kar rahi hoon"). */
export type VoicePrefs = { voiceId: string; model: string; style: "expressive" | "natural"; gender: "female" | "male" | "neutral" };
type PrefsDoc = VoicePrefs & { _id: string; updatedAt: string };

async function prefsCol() {
  return (await getDb()).collection<PrefsDoc>("voice_prefs");
}

export async function getVoicePrefs(): Promise<VoicePrefs> {
  const cfg = voiceConfig();
  const doc = await (await prefsCol()).findOne({ _id: OWNER_ID }).catch(() => null);
  return { voiceId: doc?.voiceId ?? cfg.voiceId, model: doc?.model ?? cfg.ttsModel, style: doc?.style ?? "expressive", gender: doc?.gender ?? "male" };
}

export async function setVoicePrefs(p: Partial<VoicePrefs>): Promise<VoicePrefs> {
  if (p.model && !TTS_MODELS.some((m) => m.id === p.model)) throw new HttpError(400, "unknown model");
  if (p.voiceId && !/^[A-Za-z0-9]{10,40}$/.test(p.voiceId)) throw new HttpError(400, "bad voice id");
  if (p.style && !["expressive", "natural"].includes(p.style)) throw new HttpError(400, "bad style");
  if (p.gender && !["female", "male", "neutral"].includes(p.gender)) throw new HttpError(400, "bad gender");
  const cur = await getVoicePrefs();
  const next: VoicePrefs = { voiceId: p.voiceId ?? cur.voiceId, model: p.model ?? cur.model, style: p.style ?? cur.style, gender: p.gender ?? cur.gender };
  await (await prefsCol()).updateOne({ _id: OWNER_ID }, { $set: { ...next, updatedAt: new Date().toISOString() } }, { upsert: true });
  return next;
}

export function modelSupportsTags(model: string) {
  return TTS_MODELS.find((m) => m.id === model)?.tags ?? false;
}

type VoiceListItem = { id: string; name: string; description: string; previewUrl: string | null; labels: string[] };
let voiceCache: { at: number; voices: VoiceListItem[] } | null = null;

/** His ElevenLabs voices (premade + any he added from the library). Previews are free to play. */
export async function listVoices(): Promise<VoiceListItem[]> {
  const key = requireKey();
  if (voiceCache && Date.now() - voiceCache.at < 10 * 60_000) return voiceCache.voices;
  const res = await fetch(`${API.replace("/v1", "/v2")}/voices?page_size=100`, { headers: { "xi-api-key": key }, cache: "no-store" });
  if (!res.ok) await elevenError(res);
  const j = (await res.json()) as { voices: { voice_id: string; name: string; preview_url?: string; labels?: Record<string, string> }[] };
  const voices = j.voices.map((v) => {
    const [name, ...rest] = v.name.split(" - ");
    const l = v.labels ?? {};
    return { id: v.voice_id, name: name.trim(), description: rest.join(" - ").trim(), previewUrl: v.preview_url ?? null, labels: [l.gender, l.age?.replace("_", " "), l.accent].filter((x): x is string => Boolean(x)) };
  });
  voiceCache = { at: Date.now(), voices };
  return voices;
}

/** Text -> speech, streamed back as mp3. Metered by characters, capped per month. */
export async function speak(text: string): Promise<Response> {
  const key = requireKey();
  const cfg = voiceConfig();
  const prefs = await getVoicePrefs();
  const tags = modelSupportsTags(prefs.model);
  // Emotion tags ([laughs], [excited]) only reach models that understand them; others would read them out loud.
  const cleaned = (tags ? speakable(text) : speakable(text).replace(/\[[a-z][a-z ]{1,24}\]\s*/gi, "")).slice(0, 600);
  if (!cleaned) throw new HttpError(400, "nothing to say");
  // Hinglish in Roman letters gets read with English pronunciation; Hindi words in Devanagari sound right.
  const clean = await toSpeechScript(cleaned);
  const used = await voiceUsage();
  if (used.ttsChars + clean.length > cfg.charCap) throw new HttpError(402, `voice cap for ${used.month} reached (${cfg.charCap.toLocaleString("en-IN")} chars). replies stay text-only, or raise VOICE_MONTHLY_CHAR_CAP`);
  // v3-family models only accept stability 0 / 0.5 / 1 ("natural" = 0.5).
  const expressive = prefs.style === "expressive";
  const settings = prefs.model.startsWith("eleven_v3") || prefs.model.startsWith("eleven_v4") ? { stability: expressive ? 0 : 0.5 } : { stability: expressive ? 0.3 : 0.5, similarity_boost: 0.8, style: expressive ? 0.45 : 0, speed: 1.05 };
  const res = await fetch(`${API}/text-to-speech/${encodeURIComponent(prefs.voiceId)}/stream?output_format=mp3_44100_64`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text: clean, model_id: prefs.model, voice_settings: settings }),
  });
  if (!res.ok || !res.body) await elevenError(res);
  await meter({ ttsChars: clean.length, ttsCalls: 1 });
  return new Response(res.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
}

/** What the ElevenLabs account itself says is left this billing cycle (best effort). */
export async function elevenQuota(): Promise<{ used: number; limit: number; resetsAt: string | null } | null> {
  const { key } = voiceConfig();
  if (!key) return null;
  try {
    const res = await fetch(`${API}/user/subscription`, { headers: { "xi-api-key": key }, cache: "no-store" });
    if (!res.ok) return null;
    const j = (await res.json()) as { character_count?: number; character_limit?: number; next_character_count_reset_unix?: number };
    return {
      used: j.character_count ?? 0,
      limit: j.character_limit ?? 0,
      resetsAt: j.next_character_count_reset_unix ? new Date(j.next_character_count_reset_unix * 1000).toISOString().slice(0, 10) : null,
    };
  } catch {
    return null;
  }
}

/* ---------- Hinglish pronunciation ---------- */

const Script = z.object({ script: z.string() });

/**
 * "Arre aaj Zaptick ka kaam pehle kar" -> "अरे आज Zaptick का काम पहले कर".
 * Hindi words go to Devanagari so the voice pronounces them like Hindi; English words, names, brands,
 * numbers and [emotion tags] stay as they are. Plain English skips this entirely (no extra call).
 */
export async function toSpeechScript(text: string): Promise<string> {
  if (!isHinglish(text) || /[ऀ-ॿ]/.test(text) || !llmInfo().configured) return text;
  try {
    const { data } = await parseJson({
      name: "speech_script",
      bulk: true,
      effort: "none",
      maxTokens: 1200,
      schema: Script,
      system:
        "Rewrite Hinglish for a Hindi-English text-to-speech voice. Write every Hindi (or Marathi) word in Devanagari with its natural spoken spelling. Keep English words, names, brand names (Zaptick, Komal, Sidz), numbers and anything in [square brackets] exactly as they are, in Latin letters. Do not translate, add, drop or reorder anything. Output only the rewritten text.",
      user: text,
    });
    const out = data.script.trim();
    // Guard: if the model went off the rails, speak the original.
    return out && out.length < text.length * 2.5 ? out : text;
  } catch {
    return text;
  }
}
