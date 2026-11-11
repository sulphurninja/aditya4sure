import "server-only";
import type { Filter } from "mongodb";
import { z } from "zod";
import {
  MemoryActionInput,
  MemoryCorrectInput,
  MemoryCreateInput,
  MemoryQueryInput,
  OWNER_ID,
  type Memory,
} from "@/lib/domain";
import { contentHash } from "@/lib/seed/normalize";
import { detectEntities } from "@/lib/seed/registry";
import { audit } from "./audit";
import { HttpError } from "./auth";
import { collections, newId, nowIso } from "./db";

const VISIBLE: Filter<Memory> = { status: { $in: ["active", "redacted"] }, reviewStatus: { $ne: "rejected" } };

export async function listMemories(raw: z.input<typeof MemoryQueryInput>) {
  const q = MemoryQueryInput.parse(raw);
  const { memories } = await collections();
  const filter: Filter<Memory> = { ownerId: OWNER_ID };
  if (!q.includeInactive) Object.assign(filter, VISIBLE);
  if (q.section) filter.section = q.section;
  if (q.entity) filter.entityIds = q.entity;
  if (q.review) filter.reviewStatus = q.review;
  if (q.sensitivity) filter.sensitivity = q.sensitivity;
  if (q.temporal) filter.temporal = q.temporal;
  if (q.q) {
    const rx = new RegExp(q.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ statement: rx }, { tags: rx }];
  }
  return memories
    .find(filter)
    .sort({ pinned: -1, eventAt: -1, observedAt: -1 })
    .limit(q.limit)
    .toArray();
}

export async function getMemory(id: string): Promise<Memory | null> {
  const { memories } = await collections();
  return memories.findOne({ _id: id, ownerId: OWNER_ID });
}

export async function createMemory(raw: unknown, origin: Memory["provenance"]["origin"] = "manual"): Promise<Memory> {
  const input = MemoryCreateInput.parse(raw);
  const { memories } = await collections();
  const now = nowIso();
  const entityIds = new Set([input.subjectId, ...input.entityIds, ...detectEntities(input.statement)]);
  const doc: Memory = {
    _id: newId("mem"),
    ownerId: OWNER_ID,
    subjectId: input.subjectId,
    statement: input.statement,
    type: input.type,
    section: input.section,
    topic: null,
    entityIds: [...entityIds],
    tags: input.tags,
    observedAt: now.slice(0, 10),
    eventAt: input.eventAt ?? null,
    validFrom: input.validFrom ?? now.slice(0, 10),
    validTo: input.validTo ?? null,
    temporal: input.temporal,
    confidence: input.confidence,
    status: "active",
    reviewStatus: "accepted",
    sensitivity: input.sensitivity,
    isInferred: false,
    sources: [{ kind: "manual", ref: "owner", label: "Added by you", at: now }],
    provenance: { origin, contentHash: contentHash([input.statement, input.section, input.subjectId]) },
    supersedes: [],
    supersededBy: null,
    mergedInto: null,
    reviewNotes: [],
    pinned: false,
    humanEdited: true,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
  await memories.insertOne(doc);
  await audit({ actor: "owner", action: "memory.create", targetType: "memory", targetId: doc._id });
  return doc;
}

/**
 * Corrections never silently overwrite. The old version is kept as `superseded`
 * (with validTo set) and a new version carries `supersedes: [oldId]`.
 */
export async function correctMemory(id: string, raw: unknown): Promise<Memory> {
  const input = MemoryCorrectInput.parse(raw);
  const { memories } = await collections();
  const old = await memories.findOne({ _id: id, ownerId: OWNER_ID });
  if (!old) throw new HttpError(404, "Memory not found");
  if (old.status === "superseded") throw new HttpError(409, "This version was already superseded");
  const now = nowIso();
  const { reason, ...patch } = input;
  const changed = Object.keys(patch).filter((k) => JSON.stringify((patch as Record<string, unknown>)[k]) !== JSON.stringify((old as Record<string, unknown>)[k]));
  if (!changed.length) return old;

  const statement = patch.statement ?? old.statement;
  const next: Memory = {
    ...old,
    ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)),
    _id: newId("mem"),
    statement,
    entityIds: patch.entityIds ?? [...new Set([...old.entityIds, ...detectEntities(statement)])],
    eventAt: patch.eventAt !== undefined ? patch.eventAt ?? null : old.eventAt,
    validFrom: patch.validFrom !== undefined ? patch.validFrom ?? null : old.validFrom,
    validTo: patch.validTo !== undefined ? patch.validTo ?? null : old.validTo,
    status: "active",
    reviewStatus: "accepted",
    confidence: Math.max(old.confidence, 0.95),
    sources: [...old.sources, { kind: "manual", ref: "owner", label: reason ? `Corrected by you: ${reason}` : "Corrected by you", at: now }],
    provenance: { ...old.provenance, origin: "correction", contentHash: contentHash([statement, patch.section ?? old.section, old.subjectId]) },
    supersedes: [old._id, ...old.supersedes],
    supersededBy: null,
    humanEdited: true,
    version: old.version + 1,
    createdAt: now,
    updatedAt: now,
  };
  await memories.insertOne(next);
  await memories.updateOne(
    { _id: old._id, ownerId: OWNER_ID },
    { $set: { status: "superseded", supersededBy: next._id, validTo: old.validTo ?? now.slice(0, 10), updatedAt: now } },
  );
  await audit({ actor: "owner", action: "memory.correct", targetType: "memory", targetId: next._id, changedFields: changed, note: `supersedes ${old._id}` });
  return next;
}

export async function actOnMemory(id: string, raw: unknown): Promise<Memory> {
  const { action, note } = MemoryActionInput.parse(raw);
  const { memories } = await collections();
  const cur = await memories.findOne({ _id: id, ownerId: OWNER_ID });
  if (!cur) throw new HttpError(404, "Memory not found");
  const now = nowIso();
  const set: Partial<Memory> = { updatedAt: now };
  switch (action) {
    case "approve":
      set.reviewStatus = "accepted";
      set.confidence = Math.max(cur.confidence, 0.9);
      set.humanEdited = true;
      break;
    case "reject":
      set.reviewStatus = "rejected";
      set.humanEdited = true;
      break;
    case "redact":
      // Keep the shell for provenance, drop the content everywhere it's stored.
      set.status = "redacted";
      set.statement = "[redacted by owner]";
      set.sources = cur.sources.map((s) => ({ ...s, excerpt: undefined }));
      set.tags = [];
      set.humanEdited = true;
      break;
    case "restore":
      if (cur.status === "redacted") throw new HttpError(409, "Redacted content cannot be restored");
      set.reviewStatus = "pending";
      break;
    case "pin":
      set.pinned = true;
      break;
    case "unpin":
      set.pinned = false;
      break;
  }
  await memories.updateOne({ _id: id, ownerId: OWNER_ID }, { $set: set });
  await audit({ actor: "owner", action: `memory.${action}`, targetType: "memory", targetId: id, note });
  return { ...cur, ...set } as Memory;
}

/** Hard delete. Removes the fact and every older version in its chain; audit keeps ids only. */
export async function deleteMemory(id: string): Promise<{ deleted: number }> {
  const { memories } = await collections();
  const cur = await memories.findOne({ _id: id, ownerId: OWNER_ID });
  if (!cur) throw new HttpError(404, "Memory not found");
  const chain = [cur._id, ...cur.supersedes];
  const res = await memories.deleteMany({ ownerId: OWNER_ID, _id: { $in: chain } });
  await memories.updateMany({ ownerId: OWNER_ID, mergedInto: { $in: chain } }, { $set: { mergedInto: null, status: "active" } });
  await audit({ actor: "owner", action: "memory.delete", targetType: "memory", targetId: id, note: `deleted ${res.deletedCount} version(s)` });
  return { deleted: res.deletedCount };
}

export async function bulkApprove(filter: { sensitivity?: Memory["sensitivity"][] }) {
  const { memories } = await collections();
  const res = await memories.updateMany(
    { ownerId: OWNER_ID, reviewStatus: "pending", status: "active", ...(filter.sensitivity ? { sensitivity: { $in: filter.sensitivity } } : {}) },
    { $set: { reviewStatus: "accepted", humanEdited: true, updatedAt: nowIso() } },
  );
  await audit({ actor: "owner", action: "memory.bulk_approve", targetType: "memory", targetId: "*", note: `${res.modifiedCount} approved` });
  return res.modifiedCount;
}

export async function memoryHistory(id: string) {
  const c = await collections();
  const cur = await c.memories.findOne({ _id: id, ownerId: OWNER_ID });
  if (!cur) return null;
  const versions = cur.supersedes.length
    ? await c.memories.find({ ownerId: OWNER_ID, _id: { $in: cur.supersedes } }).toArray()
    : [];
  const newer = cur.supersededBy ? await c.memories.findOne({ _id: cur.supersededBy, ownerId: OWNER_ID }) : null;
  const log = await c.audit
    .find({ ownerId: OWNER_ID, targetId: { $in: [id, ...cur.supersedes] } })
    .sort({ at: -1 })
    .limit(50)
    .toArray();
  return { memory: cur, versions, newer, log };
}
