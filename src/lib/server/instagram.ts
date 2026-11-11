import "server-only";
import { z } from "zod";
import { OWNER_ID, SELF_ID, type Memory } from "@/lib/domain";
import { contentHash } from "@/lib/seed/normalize";
import { detectEntities } from "@/lib/seed/registry";
import { audit } from "./audit";
import { sha256 } from "./crypto";
import { collections, nowIso } from "./db";

const Fact = z.object({
  key: z.string().min(1).max(200),
  statement: z.string().min(3).max(6000),
  section: z.enum(["identity", "accounts", "people", "projects", "creativity", "timeline", "tools", "relationships", "other"]),
  type: z.enum(["identity", "account", "event", "metric", "preference", "insight", "relationship", "habit"]),
  temporal: z.enum(["stable", "snapshot", "period", "unknown"]),
  eventAt: z.string().regex(/^\d{4}-\d{2}-\d{2}/).nullable(),
  sensitivity: z.enum(["normal", "private", "sensitive"]),
  isInferred: z.boolean(),
  confidence: z.number().min(0).max(1),
  file: z.string().max(200),
  tags: z.array(z.string().max(40)).max(12),
});

const Input = z.object({
  exportedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
  username: z.string().max(60).nullable(),
  displayName: z.string().max(120).nullable(),
  facts: z.array(Fact).max(3000),
});

/**
 * Upsert account-level facts from an Instagram export.
 * Idempotent: ids derive from the fact key; facts you edited or reviewed are never overwritten.
 * Direct platform data is stored as confirmed; Meta's inferences stay unverified for review.
 */
export async function importInstagramAccount(raw: unknown) {
  const input = Input.parse(raw);
  const c = await collections();
  const now = nowIso();
  const counts = { inserted: 0, updated: 0, unchanged: 0, preserved: 0 };

  for (const f of input.facts) {
    const _id = `ig:${sha256(f.key).slice(0, 20)}`;
    const hash = contentHash([f.statement, f.section, f.eventAt]);
    const existing = await c.memories.findOne({ _id, ownerId: OWNER_ID }, { projection: { humanEdited: 1, "provenance.contentHash": 1, status: 1 } });
    if (existing?.humanEdited || existing?.status === "redacted") {
      counts.preserved++;
      continue;
    }
    if (existing && existing.provenance.contentHash === hash) {
      counts.unchanged++;
      continue;
    }
    const entityIds = [...new Set([SELF_ID, ...detectEntities(f.statement)])];
    const doc: Omit<Memory, "_id"> = {
      ownerId: OWNER_ID,
      subjectId: SELF_ID,
      statement: f.statement,
      type: f.type,
      section: f.section,
      topic: "instagram",
      entityIds,
      tags: [...new Set(["instagram", ...f.tags])],
      observedAt: input.exportedAt,
      eventAt: f.eventAt,
      validFrom: f.temporal === "snapshot" ? input.exportedAt : f.eventAt,
      validTo: null,
      temporal: f.temporal,
      confidence: f.confidence,
      status: "active",
      reviewStatus: f.isInferred ? "pending" : "accepted",
      sensitivity: f.sensitivity,
      isInferred: f.isInferred,
      sources: [{ kind: "import", ref: `instagram-export:${input.exportedAt}#${f.file}`, label: `Instagram export · ${f.file}`, at: input.exportedAt }],
      provenance: { origin: "import", contentHash: hash },
      supersedes: [],
      supersededBy: null,
      mergedInto: null,
      reviewNotes: f.isInferred ? ["Inferred by Meta from your activity, not something you said."] : [],
      pinned: false,
      humanEdited: false,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    if (existing) {
      const { createdAt: _c, ...rest } = doc;
      void _c;
      await c.memories.updateOne({ _id, ownerId: OWNER_ID, humanEdited: false }, { $set: rest });
      counts.updated++;
    } else {
      await c.memories.insertOne({ _id, ...doc });
      counts.inserted++;
    }
  }

  const aliases = [input.username, input.username && `@${input.username}`, input.displayName].filter((x): x is string => Boolean(x));
  if (aliases.length) await c.entities.updateOne({ _id: SELF_ID, ownerId: OWNER_ID }, { $addToSet: { aliases: { $each: aliases } }, $set: { updatedAt: now } });

  await c.imports.insertOne({ _id: `instagram:${now}`, ownerId: OWNER_ID, kind: "seed", checksum: sha256(JSON.stringify(input.facts.map((f) => f.key))), summary: counts, at: now });
  await audit({ actor: "owner", action: "instagram.account_import", targetType: "import", targetId: input.exportedAt, note: Object.entries(counts).map(([k, v]) => `${k}:${v}`).join(" ") });
  return counts;
}
