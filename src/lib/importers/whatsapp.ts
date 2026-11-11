import { assignDupIndices, participantsOf, type ParsedMessage, type ParsedThread } from "./common";

/**
 * WhatsApp "Export chat" parser. Handles:
 *  - Android: "31/12/23, 9:41 pm - Name: text"  /  "12/31/23, 21:41 - Name: text"
 *  - iOS:     "[31/12/23, 9:41:05 PM] Name: text"
 *  - invisible marks (U+200E/F), narrow no-break spaces before AM/PM, dots or dashes in dates
 *  - multiline messages, system lines, media placeholders, deleted & edited messages
 *  - day/month order detection (falls back to DD/MM, India, when ambiguous)
 */

const DATE = String.raw`(\d{1,4})[\/.\-](\d{1,2})[\/.\-](\d{1,4})`;
const TIME = String.raw`(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?\s*([AaPp]\.?\s?[Mm]\.?)?`;
const IOS_RE = new RegExp(String.raw`^\[${DATE},?\s+${TIME}\]\s+([\s\S]*)$`);
const ANDROID_RE = new RegExp(String.raw`^${DATE},?\s+${TIME}\s+[-–—]\s+([\s\S]*)$`);

const MEDIA_RE =
  /^(<Media omitted>|<attached: [^>]+>|(image|video|audio|sticker|GIF|document|Contact card) omitted|.+\.(jpg|jpeg|png|webp|opus|mp4|pdf|vcf) \(file attached\)|null)$/i;
const DELETED_RE = /^(This message was deleted|You deleted this message|This message was deleted\.)$/i;
// "IMG-20261113-WA0004.jpg (file attached)" (Android, caption may follow) / "<attached: 00000012-PHOTO-….jpg>" (iOS)
const ANDROID_ATTACH_RE = /^([^\n<>]+?\.[a-z0-9]{2,5})\s+\(file attached\)/i;
const IOS_ATTACH_RE = /<attached:\s*([^>]+?)\s*>/i;

/** The exported file name a media message points to, if the export included media. */
export function findAttachment(text: string): string | undefined {
  return (ANDROID_ATTACH_RE.exec(text) ?? IOS_ATTACH_RE.exec(text))?.[1]?.trim();
}

/** Caption text of a media message, without the attachment marker. */
export function mediaCaption(text: string): string {
  return text.replace(ANDROID_ATTACH_RE, "").replace(IOS_ATTACH_RE, "").trim();
}
const EDITED_RE = /\s*<This message was edited>$/i;

type Raw = { a: number; b: number; c: number; h: number; min: number; s: number; ampm: string | null; rest: string };

function clean(line: string): string {
  return line.replace(/[‎‏‪-‮]/g, "").replace(/[  ]/g, " ");
}

function matchHeader(line: string): Raw | null {
  const m = IOS_RE.exec(line) ?? ANDROID_RE.exec(line);
  if (!m) return null;
  return {
    a: Number(m[1]),
    b: Number(m[2]),
    c: Number(m[3]),
    h: Number(m[4]),
    min: Number(m[5]),
    s: m[6] ? Number(m[6]) : 0,
    ampm: m[7] ? m[7].replace(/[.\s]/g, "").toLowerCase() : null,
    rest: m[8],
  };
}

export type DateOrder = "DMY" | "MDY" | "YMD";

export function detectDateOrder(raws: Pick<Raw, "a" | "b" | "c">[]): { order: DateOrder; ambiguous: boolean } {
  if (raws.some((r) => r.a > 31)) return { order: "YMD", ambiguous: false };
  if (raws.some((r) => r.a > 12)) return { order: "DMY", ambiguous: false };
  if (raws.some((r) => r.b > 12)) return { order: "MDY", ambiguous: false };
  return { order: "DMY", ambiguous: raws.length > 0 };
}

function toIso(r: Raw, order: DateOrder, tzOffsetMinutes: number): string | null {
  let d: number, mo: number, y: number;
  if (order === "YMD") [y, mo, d] = [r.a, r.b, r.c];
  else if (order === "MDY") [mo, d, y] = [r.a, r.b, r.c];
  else [d, mo, y] = [r.a, r.b, r.c];
  if (y < 100) y += 2000;
  let h = r.h;
  if (r.ampm) {
    const pm = r.ampm.startsWith("p");
    if (h === 12) h = pm ? 12 : 0;
    else if (pm) h += 12;
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || r.min > 59) return null;
  const utc = Date.UTC(y, mo - 1, d, h, r.min, r.s) - tzOffsetMinutes * 60_000;
  const date = new Date(utc);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function splitSender(rest: string): { sender: string; text: string } | null {
  const m = /^([^:\n]{1,80}?):\s([\s\S]*)$/.exec(rest);
  if (!m) {
    const bare = /^([^:\n]{1,80}?):$/.exec(rest);
    return bare ? { sender: bare[1].trim(), text: "" } : null;
  }
  return { sender: m[1].trim(), text: m[2] };
}

export function titleFromFileName(name: string | undefined): string | null {
  if (!name) return null;
  const base = name.replace(/^.*[\\/]/, "").replace(/\.(txt|zip)$/i, "");
  const m = /WhatsApp Chat (?:with|-)\s*(.+)$/i.exec(base);
  const raw = m ? m[1] : base === "_chat" ? "" : base;
  return raw.trim() || null;
}

export function parseWhatsApp(text: string, opts: { fileName?: string; tzOffsetMinutes?: number } = {}): ParsedThread & { dateOrder: DateOrder } {
  const tz = opts.tzOffsetMinutes ?? 330; // IST default
  const warnings: string[] = [];
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);

  // pass 1: find headers + group continuation lines
  const entries: Raw[] = [];
  let orphan = 0;
  for (const rawLine of lines) {
    const line = clean(rawLine);
    const h = matchHeader(line);
    if (h) entries.push(h);
    else if (entries.length) entries[entries.length - 1].rest += "\n" + line;
    else if (line.trim()) orphan++;
  }
  if (!entries.length) {
    return { source: "whatsapp", title: titleFromFileName(opts.fileName) ?? "WhatsApp chat", participants: [], messages: [], warnings: ["No WhatsApp messages found. Is this a WhatsApp 'Export chat' .txt file?"], dateOrder: "DMY" };
  }
  if (orphan) warnings.push(`${orphan} line(s) before the first message were ignored.`);

  const { order, ambiguous } = detectDateOrder(entries);
  if (ambiguous) warnings.push("Dates are ambiguous (every day ≤ 12). Assumed DD/MM/YY, flip it if dates look off.");

  const out: Omit<ParsedMessage, "dup">[] = [];
  let bad = 0;
  for (const e of entries) {
    const at = toIso(e, order, tz);
    if (!at) {
      bad++;
      continue;
    }
    const body = e.rest.replace(/\s+$/, "");
    const split = splitSender(body);
    if (!split) {
      out.push({ at, sender: "system", text: body.trim(), kind: "system", edited: false });
      continue;
    }
    let msg = split.text;
    const edited = EDITED_RE.test(msg);
    if (edited) msg = msg.replace(EDITED_RE, "");
    const trimmed = msg.trim();
    const attachment = findAttachment(trimmed);
    const kind: ParsedMessage["kind"] = DELETED_RE.test(trimmed) ? "deleted" : attachment || MEDIA_RE.test(trimmed) ? "media" : "text";
    out.push({ at, sender: split.sender, text: kind === "text" ? msg : trimmed, kind, edited, ...(attachment ? { attachment } : {}) });
  }
  if (bad) warnings.push(`${bad} message(s) had invalid dates and were skipped.`);

  const messages = assignDupIndices(out);
  const participants = participantsOf(messages);
  return {
    source: "whatsapp",
    title: titleFromFileName(opts.fileName) ?? (participants.length === 2 ? participants.join(" & ") : "WhatsApp chat"),
    participants,
    messages,
    warnings,
    dateOrder: order,
  };
}

/** Re-parse with an explicit order (when the user flips DD/MM ↔ MM/DD in the preview). */
export function parseWhatsAppWithOrder(text: string, order: DateOrder, opts: { fileName?: string; tzOffsetMinutes?: number } = {}) {
  const tz = opts.tzOffsetMinutes ?? 330;
  const base = parseWhatsApp(text, opts);
  if (base.dateOrder === order) return base;
  // Rebuild timestamps with forced order.
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const entries: Raw[] = [];
  for (const rawLine of lines) {
    const line = clean(rawLine);
    const h = matchHeader(line);
    if (h) entries.push(h);
    else if (entries.length) entries[entries.length - 1].rest += "\n" + line;
  }
  const ats = entries.map((e) => toIso(e, order, tz)).filter((x): x is string => Boolean(x));
  if (ats.length !== base.messages.length) return { ...base, warnings: [...base.warnings, `Can't apply ${order}, some dates become invalid.`] };
  const msgs = assignDupIndices(base.messages.map((m, i) => ({ at: ats[i], sender: m.sender, text: m.text, kind: m.kind, edited: m.edited, ...(m.attachment ? { attachment: m.attachment } : {}) })));
  return { ...base, messages: msgs, dateOrder: order, warnings: base.warnings.filter((w) => !w.startsWith("Dates are ambiguous")) };
}
