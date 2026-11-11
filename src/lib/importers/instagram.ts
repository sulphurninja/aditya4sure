import { assignDupIndices, participantsOf, type ParsedMessage, type ParsedThread } from "./common";

/**
 * Instagram "Download your information" (JSON format) DM parser.
 * Each conversation lives in  .../messages/inbox/<name_id>/message_1.json (+ message_2.json …).
 * Instagram double-encodes text: UTF-8 bytes escaped as \u00XX code units. fixText() repairs that.
 */

export function fixText(s: string | undefined | null): string {
  if (!s) return "";
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) > 255) return s; // already proper Unicode
  try {
    const bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return s;
  }
}

type IgMessage = {
  sender_name?: string;
  timestamp_ms?: number;
  content?: string;
  photos?: unknown[];
  videos?: unknown[];
  audio_files?: unknown[];
  gifs?: unknown[];
  files?: unknown[];
  sticker?: unknown;
  share?: { link?: string; share_text?: string };
  is_unsent?: boolean;
  reactions?: { reaction: string; actor: string }[];
};

type IgFile = {
  participants?: { name?: string }[];
  messages?: IgMessage[];
  title?: string;
  thread_path?: string;
};

export const IG_MESSAGE_FILE = /(?:^|\/)messages\/(inbox|message_requests)\/([^/]+)\/message_(\d+)\.json$/i;

export type IgThreadSummary = { folder: string; title: string; participants: string[]; count: number; lastAt: string | null; files: string[] };

export function summarizeInstagramFiles(files: Map<string, string>): IgThreadSummary[] {
  const byFolder = new Map<string, IgThreadSummary>();
  for (const [path, text] of files) {
    const m = IG_MESSAGE_FILE.exec(path);
    if (!m) continue;
    const folder = `${m[1]}/${m[2]}`;
    let data: IgFile;
    try {
      data = JSON.parse(text);
    } catch {
      continue;
    }
    const cur = byFolder.get(folder) ?? { folder, title: fixText(data.title) || m[2], participants: (data.participants ?? []).map((p) => fixText(p.name)).filter(Boolean), count: 0, lastAt: null, files: [] };
    cur.count += data.messages?.length ?? 0;
    const newest = Math.max(0, ...(data.messages ?? []).map((x) => x.timestamp_ms ?? 0));
    if (newest && (!cur.lastAt || new Date(newest).toISOString() > cur.lastAt)) cur.lastAt = new Date(newest).toISOString();
    cur.files.push(path);
    byFolder.set(folder, cur);
  }
  return [...byFolder.values()].sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? ""));
}

function classify(m: IgMessage, text: string): ParsedMessage["kind"] {
  if (m.is_unsent || /unsent a message\.?$/i.test(text)) return "deleted";
  if (m.photos?.length || m.videos?.length || m.audio_files?.length || m.gifs?.length || m.files?.length || m.sticker) return "media";
  if (/sent an attachment\.?$/i.test(text)) return "media";
  if (/^(Liked a message|Reacted .+ to your message|.+ reacted .+ to your message)$/i.test(text)) return "system";
  return "text";
}

/** Parse one conversation from its message_N.json file contents. */
export function parseInstagram(fileTexts: string[]): ParsedThread {
  const warnings: string[] = [];
  let title = "";
  const participants = new Set<string>();
  const out: Omit<ParsedMessage, "dup">[] = [];
  for (const t of fileTexts) {
    let data: IgFile;
    try {
      data = JSON.parse(t);
    } catch {
      warnings.push("One file wasn't valid JSON. Did you export in JSON format (not HTML)?");
      continue;
    }
    title ||= fixText(data.title);
    for (const p of data.participants ?? []) if (p.name) participants.add(fixText(p.name));
    for (const m of data.messages ?? []) {
      if (!m.timestamp_ms || !m.sender_name) continue;
      let text = fixText(m.content);
      if (!text && m.share) text = [fixText(m.share.share_text), m.share.link].filter(Boolean).join(" ");
      const kind = classify(m, text);
      if (kind === "media" && !text) text = m.photos?.length ? "photo" : m.videos?.length ? "video" : m.audio_files?.length ? "voice note" : "attachment";
      const first = (m.photos?.[0] ?? m.videos?.[0] ?? m.audio_files?.[0] ?? m.gifs?.[0]) as { uri?: string } | undefined;
      const attachment = typeof first?.uri === "string" && !/^https?:/.test(first.uri) ? first.uri : undefined;
      out.push({ at: new Date(m.timestamp_ms).toISOString(), sender: fixText(m.sender_name), text, kind, edited: false, ...(attachment ? { attachment } : {}) });
    }
  }
  out.sort((a, b) => a.at.localeCompare(b.at));
  const messages = assignDupIndices(out);
  const parts = participants.size ? [...participants] : participantsOf(messages);
  if (!messages.length) warnings.push("No messages found in this conversation.");
  return { source: "instagram", title: title || parts.join(" & ") || "Instagram chat", participants: parts, messages, warnings };
}
