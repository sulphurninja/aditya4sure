import "server-only";
import type { Filter } from "mongodb";
import { OWNER_ID, type Entity, type EntityKind, type Memory, type Nudge, type Section } from "@/lib/domain";
import { collections } from "./db";

const LIVE: Filter<Memory> = { ownerId: OWNER_ID, status: "active", reviewStatus: { $ne: "rejected" } };

export async function pendingReviewCount(): Promise<number> {
  const c = await collections();
  const [m, p] = await Promise.all([
    c.memories.countDocuments({ ownerId: OWNER_ID, status: "active", reviewStatus: "pending" }),
    c.proposals.countDocuments({ ownerId: OWNER_ID, status: "pending" }),
  ]);
  return m + p;
}

export async function overview() {
  const c = await collections();
  const [total, accepted, pending, sensitive, entities, convos, proposals, recentAudit, lastImport, pinned, upcoming, recent] = await Promise.all([
    c.memories.countDocuments(LIVE),
    c.memories.countDocuments({ ...LIVE, reviewStatus: "accepted" }),
    c.memories.countDocuments({ ...LIVE, reviewStatus: "pending" }),
    c.memories.countDocuments({ ...LIVE, sensitivity: "sensitive" }),
    c.entities.find({ ownerId: OWNER_ID }).toArray(),
    c.conversations.find({ ownerId: OWNER_ID }, { projection: { messages: 0 } }).sort({ updatedAt: -1 }).limit(5).toArray(),
    c.proposals.countDocuments({ ownerId: OWNER_ID, status: "pending" }),
    c.audit.find({ ownerId: OWNER_ID }).sort({ at: -1 }).limit(6).toArray(),
    c.imports.find({ ownerId: OWNER_ID }).sort({ at: -1 }).limit(1).next(),
    c.memories.find({ ...LIVE, pinned: true }).limit(6).toArray(),
    c.memories.find({ ...LIVE, temporal: { $in: ["plan", "goal"] }, eventAt: { $gte: new Date().toISOString().slice(0, 10) } }).sort({ eventAt: 1 }).limit(5).toArray(),
    c.memories.find({ ...LIVE, eventAt: { $ne: null } }).sort({ eventAt: -1 }).limit(8).toArray(),
  ]);
  const bySection = await c.memories
    .aggregate<{ _id: Section; n: number }>([{ $match: LIVE }, { $group: { _id: "$section", n: { $sum: 1 } } }, { $sort: { n: -1 } }])
    .toArray();
  const byEntity = await c.memories
    .aggregate<{ _id: string; n: number }>([{ $match: LIVE }, { $unwind: "$entityIds" }, { $group: { _id: "$entityIds", n: { $sum: 1 } } }])
    .toArray();
  const threads = await c.threads.countDocuments({ ownerId: OWNER_ID });
  return { total, accepted, pending, sensitive, entities, convos, proposals, recentAudit, lastImport, pinned, upcoming, recent, bySection, byEntity, threads };
}


function daysUntil(iso: string) {
  const d = Date.parse(iso.slice(0, 10) + "T00:00:00Z");
  const t = Date.parse(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  return Math.round((d - t) / 86_400_000);
}

function shorten(s: string, n = 70) {
  const clean = s.replace(/^Aditya (planned|has|is|wants to|targeted) /i, "").replace(/\s+/g, " ");
  return clean.length > n ? clean.slice(0, n - 1).trimEnd() + "…" : clean;
}

/** Live, data-driven nudges for the home screen, written the way Aditya talks. */
export async function homeNudges(): Promise<Nudge[]> {
  const c = await collections();
  const today = new Date().toISOString().slice(0, 10);
  const in30 = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  const [upcoming, metrics, pending, proposals, samples, threads, total] = await Promise.all([
    c.memories.find({ ...LIVE, eventAt: { $gte: today, $lte: in30 }, temporal: { $in: ["plan", "goal", "period"] } }).sort({ eventAt: 1 }).limit(2).toArray(),
    c.memories.find({ ...LIVE, temporal: "snapshot", type: "metric", section: "projects" }).sort({ eventAt: -1 }).limit(20).toArray(),
    c.memories.countDocuments({ ...LIVE, reviewStatus: "pending" }),
    c.proposals.countDocuments({ ownerId: OWNER_ID, status: "pending" }),
    c.styleSamples.countDocuments({ ownerId: OWNER_ID }),
    c.threads.countDocuments({ ownerId: OWNER_ID }),
    c.memories.countDocuments(LIVE),
  ]);
  const out: Nudge[] = [];

  if (!total) return [{ icon: "seed", text: "my brain's empty rn. import your seed first", href: "/sources" }];

  for (const m of upcoming) {
    const d = daysUntil(m.eventAt!);
    const when = d === 0 ? "today" : d === 1 ? "tomorrow" : `in ${d} days`;
    out.push({ icon: "calendar", text: `${when}: ${shorten(m.statement)}`, prompt: `What's the plan for ${m.eventAt}? Anything I still need to sort out?`, sensitive: m.sensitivity === "sensitive" });
  }

  // Stalest project metric: nudge to refresh it instead of pretending it's current.
  const seen = new Set<string>();
  for (const m of metrics) {
    const proj = m.entityIds.find((e) => e.startsWith("project:"));
    if (!proj || seen.has(proj) || !m.eventAt) continue;
    seen.add(proj);
    const age = -daysUntil(m.eventAt);
    if (age > 60) {
      const name = proj.slice(8).replace(/-/g, " ");
      const month = new Date(m.eventAt).toLocaleString("en-IN", { month: "short", year: "numeric" });
      out.push({ icon: "hourglass", text: `your latest ${name} numbers are from ${month}. still true?`, prompt: `My latest ${name} numbers are from ${month}. Here's where things are now: ` });
      break;
    }
  }

  if (pending + proposals > 0) out.push({ icon: "review", text: `${pending + proposals} things waiting for your yes or no`, href: "/review" });
  if (!threads) out.push({ icon: "chats", text: "drop in a WhatsApp chat so I learn how you actually text", href: "/chats" });
  if (samples < 10) out.push({ icon: "voice", text: samples ? `only ${samples} voice samples so far, feed me more` : "I don't know your voice yet. feed me some real texts", href: "/me" });

  return out.slice(0, 4);
}

export async function entitiesByKind(kinds: EntityKind[]) {
  const c = await collections();
  const [entities, counts] = await Promise.all([
    c.entities.find({ ownerId: OWNER_ID, kind: { $in: kinds } }).sort({ name: 1 }).toArray(),
    c.memories
      .aggregate<{ _id: string; n: number; latest: string | null }>([
        { $match: LIVE },
        { $unwind: "$entityIds" },
        { $group: { _id: "$entityIds", n: { $sum: 1 }, latest: { $max: "$eventAt" } } },
      ])
      .toArray(),
  ]);
  const map = new Map(counts.map((x) => [x._id, x]));
  return entities.map((e) => ({ ...e, memoryCount: map.get(e._id)?.n ?? 0, latest: map.get(e._id)?.latest ?? null }));
}

export async function entityDetail(kind: EntityKind | EntityKind[], slug: string) {
  const c = await collections();
  const kinds = Array.isArray(kind) ? kind : [kind];
  const entity = await c.entities.findOne({ ownerId: OWNER_ID, kind: { $in: kinds }, slug });
  if (!entity) return null;
  const [memories, edges] = await Promise.all([
    c.memories.find({ ...LIVE, entityIds: entity._id }).sort({ eventAt: -1, observedAt: -1 }).toArray(),
    c.edges.find({ ownerId: OWNER_ID, $or: [{ from: entity._id }, { to: entity._id }] }).toArray(),
  ]);
  const otherIds = edges.map((e) => (e.from === entity._id ? e.to : e.from));
  const others = await c.entities.find({ ownerId: OWNER_ID, _id: { $in: otherIds } }).toArray();
  const byId = new Map(others.map((o) => [o._id, o]));
  return {
    entity,
    memories,
    links: edges.map((e) => {
      const other = byId.get(e.from === entity._id ? e.to : e.from);
      return { label: e.label, type: e.type, direction: e.from === entity._id ? "out" : "in", other: other ?? null };
    }),
  };
}

export async function graph() {
  const c = await collections();
  const [entities, edges] = await Promise.all([c.entities.find({ ownerId: OWNER_ID }).toArray(), c.edges.find({ ownerId: OWNER_ID }).toArray()]);
  return { entities, edges };
}

export async function memoriesWhere(filter: Filter<Memory>, limit = 300): Promise<Memory[]> {
  const c = await collections();
  return c.memories.find({ ...LIVE, ...filter }).sort({ pinned: -1, eventAt: -1, observedAt: -1 }).limit(limit).toArray();
}

export async function timeline(): Promise<Memory[]> {
  const c = await collections();
  return c.memories.find({ ...LIVE, eventAt: { $ne: null } }).sort({ eventAt: -1 }).limit(500).toArray();
}

export async function reviewData() {
  const c = await collections();
  const [proposals, pending] = await Promise.all([
    c.proposals.find({ ownerId: OWNER_ID, status: "pending" }).sort({ createdAt: -1 }).limit(200).toArray(),
    c.memories.find({ ownerId: OWNER_ID, status: "active", reviewStatus: "pending" }).sort({ sensitivity: -1, section: 1 }).limit(500).toArray(),
  ]);
  return { proposals, pending };
}

export async function conversationsList() {
  const c = await collections();
  return c.conversations.find({ ownerId: OWNER_ID }, { projection: { messages: 0 } }).sort({ updatedAt: -1 }).limit(50).toArray();
}

/** Recent voice sessions for /talk (no message bodies, just the count). */
export async function voiceSessions(limit = 20) {
  const c = await collections();
  return c.conversations
    .aggregate<{ _id: string; title: string; updatedAt: string; turns: number }>([
      { $match: { ownerId: OWNER_ID, channel: "voice" } },
      { $sort: { updatedAt: -1 } },
      { $limit: limit },
      { $project: { title: 1, updatedAt: 1, turns: { $size: "$messages" } } },
    ])
    .toArray();
}

/** Was this session active recently enough to pick it back up automatically? */
export function isWarm(updatedAt: string, maxAgeMs: number) {
  return Date.now() - Date.parse(updatedAt) < maxAgeMs;
}

export async function getConversation(id: string) {
  const c = await collections();
  return c.conversations.findOne({ _id: id, ownerId: OWNER_ID });
}

export async function styleSamples() {
  const c = await collections();
  return c.styleSamples.find({ ownerId: OWNER_ID }).sort({ createdAt: -1 }).toArray();
}

export async function recentAudit(limit = 40) {
  const c = await collections();
  return c.audit.find({ ownerId: OWNER_ID }).sort({ at: -1 }).limit(limit).toArray();
}

export async function entityMap(): Promise<Record<string, Pick<Entity, "name" | "kind" | "slug">>> {
  const c = await collections();
  const all = await c.entities.find({ ownerId: OWNER_ID }, { projection: { name: 1, kind: 1, slug: 1 } }).toArray();
  return Object.fromEntries(all.map((e) => [e._id, { name: e.name, kind: e.kind, slug: e.slug }]));
}
