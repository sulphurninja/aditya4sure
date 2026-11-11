import "server-only";
import { z } from "zod";
import { OWNER_ID } from "@/lib/domain";
import { audit } from "./audit";
import { newId, nowIso } from "./db";
import { getDb } from "./mongo";

/**
 * Comeback coach: daily habits with streaks. Checked in by tapping on the Today page, or just by
 * telling the brain ("gym done, no cigs today, skipped skincare") in chat, voice or the WhatsApp wrap-up.
 */

export type Habit = { _id: string; ownerId: string; name: string; emoji: string; good: string; bad: string; active: boolean; order: number; createdAt: string };
export type Checkin = { _id: string; ownerId: string; habitId: string; date: string; done: boolean; note: string | null; via: string; at: string };

/** His 90-day comeback plan (13 Sep to 11 Dec 2026): muscle, sleep, skin, quit smoking. Editable later. */
const DEFAULTS: Omit<Habit, "_id" | "ownerId" | "createdAt">[] = [
  { name: "gym", emoji: "dumbbell", good: "trained today", bad: "skipped", active: true, order: 1 },
  { name: "no smoking", emoji: "ban", good: "smoke-free", bad: "smoked", active: true, order: 2 },
  { name: "sleep 7h+", emoji: "moon", good: "slept well", bad: "slept badly", active: true, order: 3 },
  { name: "skincare", emoji: "sparkles", good: "did skincare", bad: "skipped", active: true, order: 4 },
];

export const COMEBACK = { start: "2026-09-13", end: "2026-12-11" };

const istToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const shift = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

async function cols() {
  const db = await getDb();
  return { habits: db.collection<Habit>("habits"), checkins: db.collection<Checkin>("habit_checkins") };
}

export async function listHabits(): Promise<Habit[]> {
  const { habits } = await cols();
  let rows = await habits.find({ ownerId: OWNER_ID, active: true }).sort({ order: 1 }).toArray();
  if (!rows.length && !(await habits.countDocuments({ ownerId: OWNER_ID }))) {
    const now = nowIso();
    await habits.insertMany(DEFAULTS.map((h) => ({ ...h, _id: newId("hab"), ownerId: OWNER_ID, createdAt: now })));
    rows = await habits.find({ ownerId: OWNER_ID, active: true }).sort({ order: 1 }).toArray();
  }
  return rows;
}

export async function checkIn(habitId: string, done: boolean, opts: { date?: string; note?: string | null; via?: string } = {}) {
  const { habits, checkins } = await cols();
  const h = await habits.findOne({ ownerId: OWNER_ID, _id: habitId });
  if (!h) throw new Error("unknown habit");
  const date = opts.date && /^\d{4}-\d{2}-\d{2}$/.test(opts.date) ? opts.date : istToday();
  const _id = `${habitId}:${date}`;
  await checkins.updateOne({ _id }, { $set: { ownerId: OWNER_ID, habitId, date, done, note: opts.note ?? null, via: opts.via ?? "app", at: nowIso() } }, { upsert: true });
  await audit({ actor: opts.via === "app" ? "owner" : "ai", action: "habit.checkin", targetType: "habit", targetId: _id, note: done ? "done" : "missed" });
  return { habitId, date, done };
}

export async function clearCheckIn(habitId: string, date: string) {
  const { checkins } = await cols();
  await checkins.deleteOne({ _id: `${habitId}:${date}`, ownerId: OWNER_ID });
}

export type HabitView = Habit & { today: boolean | null; streak: number; best: number; last7: (boolean | null)[]; rate30: number };

/** Streak = consecutive done days ending today (or yesterday if today isn't logged yet). */
export async function habitBoard(): Promise<{ habits: HabitView[]; comeback: { day: number; total: number; left: number } }> {
  const today = istToday();
  const habits = await listHabits();
  const { checkins } = await cols();
  const since = shift(today, -120);
  const rows = await checkins.find({ ownerId: OWNER_ID, date: { $gte: since } }).toArray();
  const views = habits.map((h) => {
    const map = new Map(rows.filter((r) => r.habitId === h._id).map((r) => [r.date, r.done]));
    let streak = 0;
    let d = map.has(today) ? today : shift(today, -1);
    while (map.get(d) === true) {
      streak++;
      d = shift(d, -1);
    }
    let best = 0;
    let run = 0;
    for (let i = 120; i >= 0; i--) {
      if (map.get(shift(today, -i)) === true) best = Math.max(best, ++run);
      else run = 0;
    }
    const last30 = Array.from({ length: 30 }, (_, i) => map.get(shift(today, -i)));
    const logged = last30.filter((v) => v !== undefined);
    return {
      ...h,
      today: map.has(today) ? map.get(today)! : null,
      streak,
      best,
      last7: Array.from({ length: 7 }, (_, i) => map.get(shift(today, i - 6)) ?? null),
      rate30: logged.length ? Math.round((logged.filter(Boolean).length / logged.length) * 100) : 0,
    };
  });
  const total = Math.round((Date.parse(COMEBACK.end) - Date.parse(COMEBACK.start)) / 86_400_000) + 1;
  const day = Math.min(total, Math.max(0, Math.round((Date.parse(today) - Date.parse(COMEBACK.start)) / 86_400_000) + 1));
  return { habits: views, comeback: { day, total, left: Math.max(0, total - day) } };
}

/** For the brain: today's state + streaks, so briefs can coach and the wrap-up can ask. */
export async function habitsContext(): Promise<string> {
  const { habits, comeback } = await habitBoard();
  if (!habits.length) return "";
  return `\n<habits note="His comeback coach (day ${comeback.day} of ${comeback.total}, ${comeback.left} days left, ends ${COMEBACK.end}). Coach like a friend who wants him to win: specific, short, no lectures.">\n${habits
    .map((h) => `${h.name} [id ${h._id}]: today ${h.today === null ? "not logged" : h.today ? "done" : "missed"}, streak ${h.streak} (best ${h.best}), last 30 days ${h.rate30}%`)
    .join("\n")}\n</habits>`;
}

export const HabitCheckinInput = z.object({ habitId: z.string().max(40), done: z.boolean().nullable(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });
