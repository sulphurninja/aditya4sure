import "server-only";
import type { Filter } from "mongodb";
import { z } from "zod";
import { OWNER_ID, TaskCreateInput, TaskPatchInput, type Task, type TaskArea, type TaskStatus } from "@/lib/domain";
import { detectEntities } from "@/lib/seed/registry";
import { audit } from "./audit";
import { HttpError } from "./auth";
import { collections, newId, nowIso } from "./db";

export type TaskQuery = {
  status?: TaskStatus | "all";
  area?: TaskArea;
  entity?: string;
  dueBefore?: string;
  q?: string;
  limit?: number;
};

export async function listTasks(q: TaskQuery = {}): Promise<Task[]> {
  const { tasks } = await collections();
  const filter: Filter<Task> = { ownerId: OWNER_ID };
  if (q.status !== "all") filter.status = q.status ?? "open";
  if (q.area) filter.area = q.area;
  if (q.entity) filter.entityIds = q.entity;
  if (q.dueBefore) filter.due = { $ne: null, $lte: q.dueBefore };
  if (q.q) filter.title = new RegExp(q.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const rows = await tasks.find(filter).limit(Math.min(q.limit ?? 200, 500)).toArray();
  // Open first, then by due date (no due date last), then priority.
  return rows.sort(
    (a, b) =>
      Number(a.status !== "open") - Number(b.status !== "open") ||
      (a.due ?? "9999").localeCompare(b.due ?? "9999") ||
      a.priority - b.priority ||
      b.createdAt.localeCompare(a.createdAt),
  );
}

export async function createTask(raw: z.input<typeof TaskCreateInput>, actor: "owner" | "ai" = "owner"): Promise<Task> {
  const input = TaskCreateInput.parse(raw);
  const { tasks } = await collections();
  const now = nowIso();
  const doc: Task = {
    _id: newId("task"),
    ownerId: OWNER_ID,
    title: input.title,
    notes: input.notes ?? null,
    kind: input.kind,
    area: input.area,
    status: "open",
    priority: input.priority as Task["priority"],
    due: input.due ?? null,
    entityIds: [...new Set([...input.entityIds, ...detectEntities(`${input.title} ${input.notes ?? ""}`)])].filter((e) => e !== "person:aditya"),
    source: input.source,
    at: input.at ?? null,
    remindAt: input.remindAt ?? null,
    remindedAt: null,
    createdAt: now,
    updatedAt: now,
    doneAt: null,
  };
  await tasks.insertOne(doc);
  await audit({ actor, action: "task.create", targetType: "task", targetId: doc._id, note: input.source });
  return doc;
}

export async function updateTask(id: string, raw: z.input<typeof TaskPatchInput>, actor: "owner" | "ai" = "owner"): Promise<Task> {
  const patch = TaskPatchInput.parse(raw);
  const { tasks } = await collections();
  const cur = await tasks.findOne({ _id: id, ownerId: OWNER_ID });
  if (!cur) throw new HttpError(404, "Task not found");
  const now = nowIso();
  const set: Partial<Task> = { updatedAt: now };
  for (const [k, v] of Object.entries(patch)) if (v !== undefined) (set as Record<string, unknown>)[k] = v;
  if (patch.status && patch.status !== cur.status) set.doneAt = patch.status === "done" ? now : null;
  // Moving a reminder re-arms it.
  if (patch.remindAt !== undefined && patch.remindAt !== cur.remindAt) set.remindedAt = null;
  await tasks.updateOne({ _id: id, ownerId: OWNER_ID }, { $set: set });
  await audit({ actor, action: "task.update", targetType: "task", targetId: id, changedFields: Object.keys(set).filter((k) => k !== "updatedAt") });
  return { ...cur, ...set } as Task;
}

export async function deleteTask(id: string, actor: "owner" | "ai" = "owner") {
  const { tasks } = await collections();
  const r = await tasks.deleteOne({ _id: id, ownerId: OWNER_ID });
  if (!r.deletedCount) throw new HttpError(404, "Task not found");
  await audit({ actor, action: "task.delete", targetType: "task", targetId: id });
  return { deleted: r.deletedCount };
}
