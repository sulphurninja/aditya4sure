import "server-only";
import type { Filter } from "mongodb";
import { OWNER_ID, type Memory } from "@/lib/domain";
import { analyzeQuery, type QueryAnalysis } from "@/lib/retrieval/analyze";
import { collections } from "./db";

export type Evidence = {
  memory: Memory;
  score: number;
  why: string[];
};

export type RetrievalResult = {
  analysis: QueryAnalysis;
  evidence: Evidence[];
  strategy: string[];
};

const LIVE: Filter<Memory> = {
  ownerId: OWNER_ID,
  status: "active",
  reviewStatus: { $in: ["accepted", "pending"] },
};

/**
 * Hybrid retrieval over MongoDB:
 *  1. alias-matched entities (people/projects)   2. full-text index ($text)
 *  3. regex fallback on key terms                  4. section hints from intent
 *  5. pinned + voice/style facts for drafting
 * Vector search is optional and not required for useful answers.
 */
export async function retrieve(
  query: string,
  opts: { includeSensitive: boolean; limit?: number; forDrafting?: boolean; today?: string },
): Promise<RetrievalResult> {
  const analysis = analyzeQuery(query);
  const { memories } = await collections();
  const limit = opts.limit ?? 24;
  const base: Filter<Memory> = { ...LIVE };
  if (!opts.includeSensitive) base.sensitivity = { $ne: "sensitive" };

  const pool = new Map<string, Evidence>();
  const strategy: string[] = [];
  const add = (m: Memory, pts: number, why: string) => {
    const cur = pool.get(m._id);
    if (cur) {
      cur.score += pts;
      if (!cur.why.includes(why)) cur.why.push(why);
    } else pool.set(m._id, { memory: m, score: pts, why: [why] });
  };

  const tasks: Promise<void>[] = [];
  const today = opts.today ?? new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const shift = (days: number) => new Date(Date.parse(`${today}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

  if (analysis.wantsRecent) {
    // Time-aware: the last two weeks and what's coming up beat old-but-matching memories.
    strategy.push(`around ${today}`);
    tasks.push(
      memories
        .find({ ...base, eventAt: { $gte: shift(-14), $lte: `${shift(45)}\uffff` } })
        .sort({ eventAt: -1 })
        .limit(50)
        .toArray()
        .then((rows) => rows.forEach((m) => add(m, m.eventAt! >= today ? 4 : 3, m.eventAt! >= today ? "upcoming" : "recent"))),
    );
  }

  if (analysis.entities.length) {
    strategy.push(`entities: ${analysis.entities.join(", ")}`);
    // The pre-digested "full story" + core facts for a person always come first.
    tasks.push(
      memories
        .find({ ...base, entityIds: { $in: analysis.entities }, tags: { $in: ["overview", "core"] } })
        .limit(4)
        .toArray()
        .then((rows) => rows.forEach((m) => add(m, 8, "core"))),
    );
    tasks.push(
      memories
        .find({ ...base, entityIds: { $in: analysis.entities } })
        .limit(60)
        .toArray()
        .then((rows) => {
          for (const m of rows) {
            const hits = m.entityIds.filter((e) => analysis.entities.includes(e)).length;
            add(m, 3 + hits + (analysis.entities.includes(m.subjectId) ? 1.5 : 0), "entity match");
          }
        }),
    );
  }

  if (analysis.terms.length) {
    strategy.push(`text: ${analysis.terms.join(" ")}`);
    tasks.push(
      memories
        .find({ ...base, $text: { $search: analysis.terms.join(" ") } }, { projection: { score: { $meta: "textScore" } } })
        .sort({ score: { $meta: "textScore" } })
        .limit(30)
        .toArray()
        .then((rows) => {
          const max = Math.max(1, ...rows.map((r) => (r as Memory & { score?: number }).score ?? 0));
          for (const r of rows) {
            const { score, ...m } = r as Memory & { score?: number };
            add(m as Memory, 3 * ((score ?? 0) / max), "keyword");
          }
        })
        .catch(() => {
          /* text index not ready yet, regex fallback below still runs */
        }),
    );
    const longTerms = analysis.terms.filter((t) => t.length >= 4).slice(0, 6);
    if (longTerms.length) {
      const rx = longTerms.map((t) => new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
      tasks.push(
        memories
          .find({ ...base, $or: rx.map((r) => ({ statement: r })) })
          .limit(30)
          .toArray()
          .then((rows) => {
            for (const m of rows) {
              const hits = rx.filter((r) => r.test(m.statement)).length;
              add(m, 0.8 * hits, "partial match");
            }
          }),
      );
    }
  }

  if (analysis.sectionHints.length) {
    strategy.push(`sections: ${analysis.sectionHints.join(", ")}`);
    tasks.push(
      memories
        .find({ ...base, section: { $in: analysis.sectionHints } })
        .limit(40)
        .toArray()
        .then((rows) => rows.forEach((m) => add(m, 1, "topic"))),
    );
  }

  if (opts.forDrafting || analysis.draftingRequest) {
    strategy.push("voice profile");
    tasks.push(
      memories
        .find({ ...base, section: "communication" })
        .limit(12)
        .toArray()
        .then((rows) => rows.forEach((m) => add(m, 2, "voice profile"))),
    );
  }

  tasks.push(
    memories
      .find({ ...base, pinned: true })
      .limit(8)
      .toArray()
      .then((rows) => rows.forEach((m) => add(m, 1.5, "pinned"))),
  );

  await Promise.all(tasks);

  for (const ev of pool.values()) {
    const m = ev.memory;
    // Identity boundary: mother's own content only surfaces when she's the topic, and is down-ranked otherwise.
    if (m.subjectId === "person:mother" && !analysis.mentionsMother) ev.score -= 4;
    if (m.reviewStatus === "accepted") ev.score += 0.6;
    // What he told or corrected himself beats anything auto-learned.
    if (m.humanEdited && !m.tags?.includes("digest")) ev.score += 2.5;
    // Chat-digest trivia (relationship moments, tastes) only when the question is personal.
    if (!analysis.personal && m.tags?.includes("digest")) ev.score -= m.tags.includes("overview") ? 1 : 3;
    // Broad "about me": what he's building and who he is beats tastes and gossip.
    if (analysis.broadSelf) {
      if (["career", "projects", "goals", "identity", "tools", "communication"].includes(m.section)) ev.score += 2;
      if (["relationships", "health", "pets", "accounts"].includes(m.section)) ev.score -= 2;
    }
    if (analysis.years.length && m.eventAt && analysis.years.some((y) => m.eventAt!.startsWith(y))) {
      ev.score += 1.5;
      ev.why.push(`date ${analysis.years.join("/")}`);
    }
    if (analysis.wantsCurrent && m.temporal === "snapshot") ev.why.push("historical snapshot");
    if (analysis.wantsRecent && m.eventAt && m.eventAt < shift(-60)) ev.score -= 2.5;
    ev.score += m.confidence * 0.5;
  }

  const evidence = [...pool.values()]
    .filter((e) => e.score > 0.5)
    .sort((a, b) => b.score - a.score || (b.memory.eventAt ?? "").localeCompare(a.memory.eventAt ?? ""))
    .slice(0, limit);

  return { analysis, evidence, strategy };
}
