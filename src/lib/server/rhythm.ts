import "server-only";
import { OWNER_ID } from "@/lib/domain";
import { audit } from "./audit";
import { nowIso } from "./db";
import { getDb } from "./mongo";
import { sendWhatsAppText, whatsappReady } from "./whatsapp";
import { askBrain, forScreen, replyVoice } from "./whatsapp-inbound";

/**
 * The daily rhythm, delivered to WhatsApp and kept for the Today page:
 *   morning (08:00 IST)  brief: what's on, overdue, money, one nudge         text + voice note
 *   night   (22:00 IST)  wrap-up: which todos got done, spends, anything new  text (he replies in one go)
 *   weekly  (Sun 19:00)  review: done vs slipped, money in/out, next week     text + voice note
 * Each fires once per day (atomic marker), from the same every-minute tick as reminders.
 */

export type RhythmKind = "morning" | "night" | "weekly" | "monthly";
export type RhythmEntry = { _id: string; ownerId: string; kind: RhythmKind; date: string; text: string; whatsapp: string; at: string };

const PROMPTS: Record<RhythmKind, string> = {
  morning: "/brief",
  night:
    "[night check-in, scheduled] Write my night wrap-up check-in. First line: a one-line vibe check on the day. Then number my todos due today or overdue that are still open (time first if there is one) and ask which ones got done. Then ask if I spent or received any money today, a quick comeback check-in on the habits not logged yet today (gym, smoke-free, sleep, skincare, in one line), and if there's anything I want you to remember or remind me about tomorrow. Short, my style. Tell me I can answer everything in one message.",
  monthly:
    "[monthly money report, scheduled] Write my money report for LAST month (it just ended): 1) in, spent, saved and what was left, vs the month before, 2) where it went, top categories and the biggest leaks, 3) recurring payments, 4) who owes who, 5) flat goal progress and what this month needs, 6) one honest money move for this month. Numbered, short, my style. Use only what's logged; say if something is missing.",
  weekly:
    "[weekly review, scheduled] Write my Sunday week review: 1) what got done this week, 2) what slipped or is overdue, 3) money this week and this month (in, spent, saved, in hand, flat goal progress), 4) what's coming up next week (dated plans, closest first), 5) one honest nudge. Numbered sections, short lines, my style.",
};

/** IST clock times; override with RHYTHM_MORNING / RHYTHM_NIGHT / RHYTHM_WEEKLY (HH:MM, weekly is Sundays). */
function schedule(): Record<RhythmKind, string> {
  return {
    morning: process.env.RHYTHM_MORNING || "08:00",
    night: process.env.RHYTHM_NIGHT || "22:00",
    weekly: process.env.RHYTHM_WEEKLY || "19:00",
    monthly: process.env.RHYTHM_MONTHLY || "09:00",
  };
}

function istNow() {
  const d = new Date();
  return {
    date: d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }),
    time: d.toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" }),
    weekday: d.toLocaleDateString("en-US", { timeZone: "Asia/Kolkata", weekday: "long" }),
  };
}

async function log() {
  return (await getDb()).collection<RhythmEntry>("rhythm_log");
}

/** Generate one rhythm message (and optionally send it). Used by the scheduler and the Today page's "run now". */
export async function runRhythm(kind: RhythmKind, opts: { send: boolean }): Promise<RhythmEntry> {
  const { date } = istNow();
  const { text } = await askBrain(PROMPTS[kind], false, true);
  const clean = forScreen(text) || "nothing to report, quiet one.";
  let whatsapp = "not sent";
  if (opts.send && whatsappReady()) {
    const r = await sendWhatsAppText(clean);
    whatsapp = r.ok ? "sent" : r.reason === "window_closed" ? "window closed" : `error: ${r.detail}`;
    // Voice note for the brief and the review (the wrap-up is a question list, text is better).
    if (r.ok && kind !== "night") await replyVoice(text);
  }
  const entry: RhythmEntry = { _id: `${kind}:${date}`, ownerId: OWNER_ID, kind, date, text: clean, whatsapp, at: nowIso() };
  await (await log()).updateOne({ _id: entry._id }, { $set: entry }, { upsert: true });
  await audit({ actor: "system", action: `rhythm.${kind}`, targetType: "rhythm", targetId: entry._id, note: `whatsapp ${whatsapp}` });
  return entry;
}

/** Called every minute. Fires each rhythm once, any time within the hour after its slot (so a missed minute isn't lost). */
export async function runDueRhythms() {
  if (process.env.RHYTHM_OFF === "1") return { fired: [] as string[] };
  const now = istNow();
  const s = schedule();
  const due: RhythmKind[] = [];
  const inWindow = (slot: string) => {
    const [h, m] = slot.split(":").map(Number);
    const [nh, nm] = now.time.split(":").map(Number);
    const diff = nh * 60 + nm - (h * 60 + m);
    return diff >= 0 && diff < 60;
  };
  if (inWindow(s.morning)) due.push("morning");
  if (inWindow(s.night)) due.push("night");
  if (now.weekday === "Sunday" && inWindow(s.weekly)) due.push("weekly");
  if (now.date.endsWith("-01") && inWindow(s.monthly)) due.push("monthly");

  const fired: string[] = [];
  const col = await log();
  for (const kind of due) {
    // Atomic claim so overlapping ticks never double-send.
    const claim = await col.updateOne(
      { _id: `${kind}:${now.date}` },
      { $setOnInsert: { _id: `${kind}:${now.date}`, ownerId: OWNER_ID, kind, date: now.date, text: "", whatsapp: "pending", at: nowIso() } },
      { upsert: true },
    );
    if (!claim.upsertedCount) continue;
    try {
      await runRhythm(kind, { send: true });
      fired.push(kind);
    } catch (err) {
      console.error(`[rhythm] ${kind} failed:`, err instanceof Error ? err.message.slice(0, 160) : "unknown");
      await col.deleteOne({ _id: `${kind}:${now.date}`, text: "" }); // let the next tick retry
    }
  }
  return { fired };
}

export async function latestRhythms(limit = 6) {
  return (await log()).find({ ownerId: OWNER_ID, text: { $ne: "" } }).sort({ at: -1 }).limit(limit).toArray();
}
