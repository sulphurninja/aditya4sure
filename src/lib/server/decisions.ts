import "server-only";
import { OWNER_ID, SELF_ID } from "@/lib/domain";
import { detectEntities } from "@/lib/seed/registry";
import { audit } from "./audit";
import { newId, nowIso } from "./db";
import { getDb } from "./mongo";
import { createTask } from "./tasks";

/**
 * Decision log: "decided: Sunday plan is lunch at 1, movie at 4". Firm decisions he made, with an
 * optional follow-through date (becomes a promised todo that pings him), so the brain can hold the line
 * and call it out kindly when he starts drifting ("dekhte hai", "maybe instead...").
 */

export type Decision = {
  _id: string;
  ownerId: string;
  statement: string;
  why: string | null;
  entityIds: string[];
  decidedAt: string;
  followUp: string | null;
  taskId: string | null;
  status: "active" | "done" | "changed" | "dropped";
  changeNote: string | null;
  drifts: { at: string; note: string }[];
  updatedAt: string;
};

async function col() {
  return (await getDb()).collection<Decision>("decisions");
}

const istToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

export async function activeDecisions(limit = 30) {
  return (await col()).find({ ownerId: OWNER_ID, status: "active" }).sort({ decidedAt: -1 }).limit(limit).toArray();
}

export async function listDecisions(limit = 60) {
  return (await col()).find({ ownerId: OWNER_ID }).sort({ decidedAt: -1 }).limit(limit).toArray();
}

export async function recordDecision(d: { statement: string; why?: string | null; followUp?: string | null }, actor: "owner" | "ai" = "ai") {
  const c = await col();
  // Same decision said twice: keep one.
  const dup = await c.findOne({ ownerId: OWNER_ID, status: "active", statement: d.statement });
  if (dup) return dup;
  const now = nowIso();
  const followUp = d.followUp && /^\d{4}-\d{2}-\d{2}$/.test(d.followUp) && d.followUp >= istToday() ? d.followUp : null;
  const doc: Decision = {
    _id: newId("dec"),
    ownerId: OWNER_ID,
    statement: d.statement.slice(0, 500),
    why: d.why?.slice(0, 500) ?? null,
    entityIds: detectEntities(d.statement).filter((e) => e !== SELF_ID),
    decidedAt: now,
    followUp,
    taskId: null,
    status: "active",
    changeNote: null,
    drifts: [],
    updatedAt: now,
  };
  if (followUp) {
    const t = await createTask(
      {
        title: `Follow through: ${doc.statement}`.slice(0, 300),
        kind: "commitment",
        area: doc.entityIds.includes("person:komal") ? "relationships" : "work",
        priority: 1,
        due: followUp,
        remindAt: new Date(Date.parse(`${followUp}T10:00:00+05:30`)).toISOString(),
        entityIds: doc.entityIds,
        notes: `You decided this on ${istToday()}. Say it once, then do it.`,
        source: "decision log",
      },
      actor,
    );
    doc.taskId = t._id;
  }
  await c.insertOne(doc);
  await audit({ actor, action: "decision.create", targetType: "decision", targetId: doc._id });
  return doc;
}

/** He's wobbling on a decision: note it (the reply calls it out). */
export async function noteDrift(id: string, note: string) {
  const c = await col();
  await c.updateOne({ _id: id, ownerId: OWNER_ID }, { $push: { drifts: { at: nowIso(), note: note.slice(0, 300) } }, $set: { updatedAt: nowIso() } });
  return c.findOne({ _id: id });
}

export async function setDecisionStatus(id: string, status: Decision["status"], changeNote?: string | null) {
  const c = await col();
  await c.updateOne({ _id: id, ownerId: OWNER_ID }, { $set: { status, changeNote: changeNote?.slice(0, 500) ?? null, updatedAt: nowIso() } });
  await audit({ actor: "owner", action: "decision.status", targetType: "decision", targetId: id, note: status });
  return c.findOne({ _id: id });
}

/* ---------------- practice: the 5 habits he's building ---------------- */

export const PRACTICES = [
  { key: "decided-plan", title: "Bring a decided plan, not a question", how: "For anything you two do next, propose the full plan (time, place, booked) instead of asking 'what do you wanna do?'. She can tweak it, you carry the thinking." },
  { key: "deadline", title: "Decide by a deadline, then stop reopening it", how: "Pick one open decision, set when it gets locked, lock it, send one clean message. No 'dekhte hai' after." },
  { key: "dated-promise", title: "Every promise gets a date, or don't make it", how: "Any 'I'll do X' today: say it with a when, and tell ADITYA so it pings you. If you can't date it, don't promise it." },
  { key: "hold-a-line", title: "Hold one line in front of her", how: "No drinking, even when friends push. Let her see you stay firm without announcing it." },
  { key: "say-it-once", title: "Say it once, calmly", how: "No 'I swear I swear'. One clear 'I'll handle it', then handle it." },
  { key: "feeling-first", title: "Feeling first, facts second", how: "If she's upset, your first line names what she felt. No 'but', no joke, no over-apology before that." },
] as const;

/** One practice per day, rotating. */
export function todaysPractice(day = istToday()) {
  const n = Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
  return PRACTICES[n % PRACTICES.length];
}

/** For the brain: active decisions + today's practice, so briefs/wrap-ups coach and replies can catch drift. */
export async function decisionsContext(): Promise<string> {
  const [active, p] = [await activeDecisions(15), todaysPractice()];
  const lines = active.map((d) => `[${d._id}] decided ${d.decidedAt.slice(0, 10)}: ${d.statement}${d.followUp ? ` (follow through by ${d.followUp})` : ""}${d.drifts.length ? ` (wobbled ${d.drifts.length}x)` : ""}`);
  return `\n<decisions note="Firm decisions he made. Hold him to them: if he starts drifting, remind him what he decided and when, and ask for one clear call. Changing a decision is fine only with a real reason, said once.">\n${lines.join("\n") || "none yet"}\n</decisions>\n<practice note="What he's practising (Komal asked him to be more emotionally intelligent and decision-oriented, committed to what he says). Today's focus below; coach it briefly in briefs, ask about it in the night wrap-up.">\ntoday: ${p.title}. ${p.how}\n</practice>`;
}
