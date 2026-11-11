import "server-only";
import { z } from "zod";
import { OWNER_ID, SELF_ID } from "@/lib/domain";
import { audit } from "./audit";
import { collections, nowIso } from "./db";
import { Extracted, RULES, stageProposals } from "./extract";
import { llmInfo, parseJson } from "./llm";
import { getDb } from "./mongo";
import { createTask, listTasks } from "./tasks";

/**
 * Nightly memory sweep (11:30 PM IST, or "learn from today" on the Today page):
 * everything he said since the last sweep (typed chat, voice sessions, WhatsApp) is read once.
 *   - durable facts      -> proposals in the review queue (one tap to keep), near-duplicates skipped
 *   - promises to people -> "promised" todos that ping him at 10 AM on the due day if still open
 * Nothing becomes a memory without his tap. Only HIS words count; assistant replies are context.
 */

const Sweep = Extracted.extend({
  commitments: z
    .array(
      z.object({
        title: z.string().describe("What he promised, specific: 'Send Sidz automation templates to Pranav'"),
        to_whom: z.string().nullable(),
        due_date: z.string().nullable().describe("YYYY-MM-DD if a day was said or clearly implied ('by Friday'), else null"),
        evidence_quote: z.string(),
      }),
    )
    .describe("Promises Aditya made to other people (I'll send / I'll call / I'll pay by...). Not his own personal todos."),
});

type State = { _id: string; lastRunAt: string };

async function state() {
  return (await getDb()).collection<State>("learn_state");
}

const esc = (s: string) => s.replace(/</g, "&lt;");

function istDate(iso = new Date().toISOString()) {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function tenAm(date: string) {
  const t = Date.parse(`${date}T10:00:00+05:30`);
  return Number.isNaN(t) || t < Date.now() ? null : new Date(t).toISOString();
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

function similar(a: string, b: string) {
  const A = new Set(norm(a).split(" ").filter((w) => w.length > 2));
  const B = new Set(norm(b).split(" ").filter((w) => w.length > 2));
  if (!A.size || !B.size) return false;
  let hit = 0;
  for (const w of A) if (B.has(w)) hit++;
  return hit / Math.min(A.size, B.size) >= 0.6;
}

export type LearnResult = { conversations: number; messages: number; proposed: number; skipped: number; commitments: string[] };

export async function learnFromRecent(opts: { force?: boolean } = {}): Promise<LearnResult> {
  const empty: LearnResult = { conversations: 0, messages: 0, proposed: 0, skipped: 0, commitments: [] };
  if (!llmInfo().configured) return empty;
  const st = await state();
  const prev = await st.findOne({ _id: OWNER_ID });
  const since = prev?.lastRunAt && !opts.force ? prev.lastRunAt : new Date(Date.now() - 24 * 3600_000).toISOString();
  const startedAt = nowIso();

  const { conversations } = await collections();
  const convos = await conversations.find({ ownerId: OWNER_ID, updatedAt: { $gte: since } }).sort({ updatedAt: 1 }).limit(40).toArray();
  const blocks: string[] = [];
  let count = 0;
  let budget = 30_000;
  for (const c of convos) {
    const msgs = c.messages.filter((m) => m.at >= since);
    if (!msgs.some((m) => m.role === "user")) continue;
    const body = msgs
      .map((m) => (m.role === "user" ? `<user_message at="${istDate(m.at)}">${esc(m.content.slice(0, 1500))}</user_message>` : `<assistant_context>${esc(m.content.slice(0, 400))}</assistant_context>`))
      .join("\n");
    const piece = `<conversation channel="${c.channel ?? "text"}">\n${body}\n</conversation>`;
    if (piece.length > budget) break;
    budget -= piece.length;
    blocks.push(piece);
    count += msgs.filter((m) => m.role === "user").length;
  }
  if (!blocks.length) {
    await st.updateOne({ _id: OWNER_ID }, { $set: { lastRunAt: startedAt } }, { upsert: true });
    return empty;
  }

  const { data } = await parseJson({
    name: "daily_learning",
    schema: Sweep,
    effort: "medium",
    maxTokens: 12000,
    system: `You review everything Aditya Pingle said to his personal second brain today (typed chat, voice and WhatsApp) and pull out what's worth keeping. Today is ${istDate()} (IST).
- Only use what Aditya himself wrote in <user_message>. <assistant_context> is the brain's own reply: context only, never a source of facts.
- Questions he asked are not facts. Things already handled as todos/money entries in the moment (e.g. "spent 450 on uber") are not memories unless they say something lasting about him.
${RULES}
Commitments: promises he made to OTHER people with something to deliver ("told Pranav I'll send the templates by Friday"). Resolve dates against the message date.`,
    user: `<today>\n${blocks.join("\n")}\n</today>`,
  });

  const staged = await stageProposals(data.memories, "daily-sweep", SELF_ID, { skipDuplicates: true });

  const open = await listTasks({ status: "open", limit: 200 });
  const commitments: string[] = [];
  for (const cmt of data.commitments.slice(0, 10)) {
    const title = cmt.to_whom && !norm(cmt.title).includes(norm(cmt.to_whom).split(" ")[0]) ? `${cmt.title} (for ${cmt.to_whom})` : cmt.title;
    if (open.some((t) => similar(t.title, title))) continue;
    const due = cmt.due_date && /^\d{4}-\d{2}-\d{2}$/.test(cmt.due_date) ? cmt.due_date : null;
    await createTask(
      { title: title.slice(0, 300), kind: "commitment", area: "work", priority: 2, due, remindAt: due ? tenAm(due) : null, notes: `you said: "${cmt.evidence_quote.slice(0, 300)}"`, source: "daily sweep" },
      "ai",
    );
    commitments.push(title);
  }

  await st.updateOne({ _id: OWNER_ID }, { $set: { lastRunAt: startedAt } }, { upsert: true });
  await audit({ actor: "ai", action: "learn.sweep", targetType: "conversation", targetId: "daily", note: `${blocks.length} convos, ${staged.created} proposed, ${staged.skipped} skipped, ${commitments.length} commitments` });
  return { conversations: blocks.length, messages: count, proposed: staged.created, skipped: staged.skipped, commitments };
}

/** Called every minute; runs the sweep once a night inside its hour (default 23:30 IST, LEARN_AT to change). */
export async function runDueLearning() {
  if (process.env.LEARN_OFF === "1") return null;
  const slot = process.env.LEARN_AT || "23:30";
  const now = new Date();
  const time = now.toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" });
  const [h, m] = slot.split(":").map(Number);
  const [nh, nm] = time.split(":").map(Number);
  const diff = nh * 60 + nm - (h * 60 + m);
  if (diff < 0 || diff >= 60) return null;
  const log = (await getDb()).collection<{ _id: string; at: string }>("rhythm_log");
  const key = `learn:${istDate()}`;
  const claim = await log.updateOne({ _id: key }, { $setOnInsert: { _id: key, at: nowIso() } }, { upsert: true });
  if (!claim.upsertedCount) return null;
  try {
    return await learnFromRecent();
  } catch (err) {
    await log.deleteOne({ _id: key });
    throw err;
  }
}

export async function pendingReviewCounts() {
  const { proposals, memories } = await collections();
  const [props, mems] = await Promise.all([
    proposals.countDocuments({ ownerId: OWNER_ID, status: "pending" }),
    memories.countDocuments({ ownerId: OWNER_ID, status: "active", reviewStatus: "pending" }),
  ]);
  return { proposals: props, memories: mems };
}
