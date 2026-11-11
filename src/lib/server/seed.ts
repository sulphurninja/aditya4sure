import "server-only";
import { readFile } from "node:fs/promises";
import type { AnyBulkWriteOperation } from "mongodb";
import path from "node:path";
import { OWNER_ID, type Memory } from "@/lib/domain";
import { normalizeSeed } from "@/lib/seed/normalize";
import { EDGES, REGISTRY } from "@/lib/seed/registry";
import { audit } from "./audit";
import { collections, nowIso } from "./db";
import { env } from "./env";

export type SeedAction = "insert" | "update" | "unchanged" | "preserved" | "excluded";

export type SeedPlanRow = {
  seedId: string;
  id: string;
  action: SeedAction;
  reason: string;
  statement: string;
  section: string;
  sensitivity: string;
  status: string;
  notes: string[];
};

export type SeedPlan = {
  checksum: string;
  rows: SeedPlanRow[];
  counts: Record<SeedAction, number>;
  issues: { id: string; message: string }[];
  entities: number;
  edges: number;
};

async function loadSeed(): Promise<unknown> {
  const file = path.resolve(process.cwd(), env().SEED_FILE);
  // Only allow reading inside the project directory.
  if (!file.startsWith(path.resolve(process.cwd()))) throw new Error("SEED_FILE must live inside the project");
  const text = await readFile(file, "utf8");
  if (text.length > 5_000_000) throw new Error("Seed file too large");
  return JSON.parse(text);
}

export async function planSeedImport(opts: {
  excludeSensitive: boolean;
  excludeIds: string[];
}): Promise<{ plan: SeedPlan; memories: Memory[] }> {
  const { memories, issues, checksum } = normalizeSeed(await loadSeed());
  const { memories: col } = await collections();
  const existing = await col
    .find(
      { ownerId: OWNER_ID, "provenance.seedId": { $in: memories.map((m) => m.provenance.seedId!) } },
      { projection: { _id: 1, humanEdited: 1, version: 1, reviewStatus: 1, status: 1, "provenance.contentHash": 1, "provenance.seedId": 1 } },
    )
    .toArray();
  const byId = new Map(existing.map((e) => [e.provenance.seedId!, e]));
  const exclude = new Set(opts.excludeIds);

  const rows: SeedPlanRow[] = memories.map((m) => {
    const seedId = m.provenance.seedId!;
    const cur = byId.get(seedId);
    let action: SeedAction;
    let reason: string;
    if (!cur && (exclude.has(seedId) || (opts.excludeSensitive && m.sensitivity === "sensitive"))) {
      action = "excluded";
      reason = exclude.has(seedId) ? "Excluded by you" : "Sensitive facts excluded";
    } else if (!cur) {
      action = "insert";
      reason = "New fact";
    } else if (cur.humanEdited || cur.version > 1 || cur.reviewStatus !== "pending" || cur.status === "redacted") {
      action = "preserved";
      reason = "You reviewed or edited this, re-import never overwrites it";
    } else if (cur.provenance.contentHash === m.provenance.contentHash) {
      action = "unchanged";
      reason = "Identical to stored copy";
    } else {
      action = "update";
      reason = "Seed content changed and you haven't touched it";
    }
    return {
      seedId,
      id: m._id,
      action,
      reason,
      statement: m.statement,
      section: m.section,
      sensitivity: m.sensitivity,
      status: m.status,
      notes: m.reviewNotes,
    };
  });

  const counts = { insert: 0, update: 0, unchanged: 0, preserved: 0, excluded: 0 } as Record<SeedAction, number>;
  for (const r of rows) counts[r.action] += 1;

  return {
    plan: { checksum, rows, counts, issues, entities: REGISTRY.length, edges: EDGES.length },
    memories,
  };
}

export async function runSeedImport(opts: { excludeSensitive: boolean; excludeIds: string[] }): Promise<SeedPlan> {
  const { plan, memories } = await planSeedImport(opts);
  const c = await collections();
  const now = nowIso();
  const actionById = new Map(plan.rows.map((r) => [r.id, r.action]));

  const memOps = memories.flatMap((m): AnyBulkWriteOperation<Memory>[] => {
    const action = actionById.get(m._id);
    if (action === "insert") {
      const { _id, ...rest } = m;
      return [{ updateOne: { filter: { _id, ownerId: OWNER_ID }, update: { $setOnInsert: { ...rest, createdAt: now, updatedAt: now } }, upsert: true } }];
    }
    if (action === "update") {
      // Only seed-owned fields; guarded so a concurrent human edit is never clobbered.
      return [
        {
          updateOne: {
            filter: { _id: m._id, ownerId: OWNER_ID, humanEdited: false, version: 1, reviewStatus: "pending" as const },
            update: {
              $set: {
                statement: m.statement,
                section: m.section,
                type: m.type,
                temporal: m.temporal,
                eventAt: m.eventAt,
                observedAt: m.observedAt,
                validFrom: m.validFrom,
                sensitivity: m.sensitivity,
                confidence: m.confidence,
                entityIds: m.entityIds,
                tags: m.tags,
                sources: m.sources,
                provenance: m.provenance,
                reviewNotes: m.reviewNotes,
                mergedInto: m.mergedInto,
                status: m.status,
                updatedAt: now,
              },
            },
          },
        },
      ];
    }
    return [];
  });
  if (memOps.length) await c.memories.bulkWrite(memOps, { ordered: false });

  // Entities: create if missing; merge aliases; never overwrite human-edited names/descriptions.
  await c.entities.bulkWrite(
    REGISTRY.map((e) => ({
      updateOne: {
        filter: { _id: e.id, ownerId: OWNER_ID },
        update: {
          $setOnInsert: {
            ownerId: OWNER_ID,
            kind: e.kind,
            name: e.name,
            slug: e.slug,
            relationship: e.relationship,
            description: e.description,
            sensitivity: e.sensitivity,
            identityBoundary: e.identityBoundary ?? false,
            createdAt: now,
          },
          $addToSet: { aliases: { $each: e.aliases } },
          $set: { updatedAt: now },
        },
        upsert: true,
      },
    })),
    { ordered: false },
  );

  await c.edges.bulkWrite(
    EDGES.map((e) => ({
      updateOne: {
        filter: { ownerId: OWNER_ID, from: e.from, to: e.to, type: e.type },
        update: {
          $setOnInsert: { _id: `edge:${e.from}>${e.to}:${e.type}`, ownerId: OWNER_ID, label: e.label, sourceMemoryIds: [] },
        },
        upsert: true,
      },
    })),
    { ordered: false },
  );

  await c.imports.insertOne({
    _id: `seed:${now}`,
    ownerId: OWNER_ID,
    kind: "seed",
    checksum: plan.checksum,
    summary: plan.counts,
    at: now,
  });
  await audit({
    actor: "owner",
    action: "seed.import",
    targetType: "import",
    targetId: plan.checksum.slice(0, 16),
    note: Object.entries(plan.counts)
      .map(([k, v]) => `${k}:${v}`)
      .join(" "),
  });
  return plan;
}
