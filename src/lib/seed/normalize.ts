import { createHash } from "node:crypto";
import { z } from "zod";
import {
  OWNER_ID,
  SECTIONS,
  type Memory,
  type MemoryType,
  type Section,
  type Sensitivity,
  type Temporal,
} from "@/lib/domain";
import { detectEntities, REGISTRY, SUBJECT_MAP } from "./registry";

export const SeedFact = z.object({
  id: z.string().regex(/^f\d{4}$/),
  section: z.string(),
  subject: z.string(),
  statement: z.string().min(1),
  as_of: z.string().nullable(),
  confidence: z.enum(["high", "medium", "low"]),
  status: z.string(),
  source: z.string(),
  sensitivity: z.enum(["normal", "sensitive"]),
  tags: z.array(z.string()).default([]),
  temporal_state: z.string(),
});
export type SeedFact = z.infer<typeof SeedFact>;

export const SeedFile = z.object({
  schema_version: z.string(),
  owner: z.string(),
  compiled_at: z.string(),
  facts: z.array(SeedFact).max(5000),
  account_identity_boundaries: z.array(z.object({ pattern: z.string(), reason: z.string() })).default([]),
});
export type SeedFile = z.infer<typeof SeedFile>;

/**
 * Hand-reviewed corrections for known issues in the candidate seed.
 * Applied as rules, the original JSON is never edited.
 */
export const SEED_RULES: Record<
  string,
  { mergedInto?: string; notes?: string[]; sensitivity?: Sensitivity; eventIsAsOf?: boolean }
> = {
  f0092: {
    mergedInto: "f0064",
    notes: ["Duplicate of f0064 (same 16 Nov date plan); merged. Seed marked it 'normal' while f0064 was 'sensitive'."],
    sensitivity: "sensitive",
  },
  f0064: {
    eventIsAsOf: true,
    notes: ["as_of (2026-11-16) is the planned event date, not when this was recorded. Not booking-confirmed."],
  },
  f0070: {
    notes: [
      "Check values: 5 ft 8 in ≈ 173 cm, not 169 cm.",
      "49 kg at that height is unusually low. Confirm or correct.",
    ],
  },
  f0090: { notes: ["Overlaps f0022 (Kolkata stay with Shubhodeep)."] },
  f0022: { notes: ["Overlaps f0090 (Kolkata move, Dec 2025)."] },
  f0091: { notes: ["Overlaps f0026 / f0035 (ILH showcase, 27 Oct 2026)."] },
  f0035: { notes: ["Overlaps f0026 / f0091 (ILH showcase)."] },
  f0068: {
    notes: ["Identity boundary: mother's first-person content must never be attributed to Aditya."],
  },
};

const SECTION_ALIASES: Record<string, Section> = { creativity: "creativity" };

function toSection(s: string): Section {
  if ((SECTIONS as readonly string[]).includes(s)) return s as Section;
  return SECTION_ALIASES[s] ?? "other";
}

const DEFAULT_TYPE: Record<Section, MemoryType> = {
  identity: "identity",
  accounts: "account",
  career: "experience",
  people: "relationship",
  projects: "project_fact",
  goals: "goal",
  planning: "plan",
  relationships: "relationship",
  family: "relationship",
  pets: "relationship",
  health: "habit",
  creativity: "preference",
  tools: "skill",
  communication: "style",
  timeline: "event",
  money: "metric",
  other: "insight",
};

export function classify(f: SeedFact): { type: MemoryType; temporal: Temporal } {
  const section = toSection(f.section);
  const st = f.status;
  const ts = f.temporal_state;
  if (ts === "historical_metric" || ts === "historical_measurement" || ts === "estimate")
    return { type: "metric", temporal: "snapshot" };
  if (st === "goal") return { type: "goal", temporal: "goal" };
  if (st === "planned_future" || st === "plan" || st === "historical_plan") return { type: "plan", temporal: "plan" };
  if (st === "historical" || st === "historical_unverified") return { type: DEFAULT_TYPE[section], temporal: "snapshot" };
  if (st === "historical_routine") return { type: "habit", temporal: "snapshot" };
  if (st === "reported_milestone") return { type: "event", temporal: "period" };
  if (st === "preference" || st === "repeated_preference" || st === "observed_preference")
    return { type: section === "communication" ? "style" : "preference", temporal: "stable" };
  if (st === "observed_pattern") return { type: section === "communication" ? "style" : "habit", temporal: "stable" };
  if (st === "value" || st === "stated_concern") return { type: "belief", temporal: "stable" };
  if (st === "idea" || st === "exploration" || st === "in_progress") return { type: "project_fact", temporal: "period" };
  if (st === "self_description") return { type: "identity", temporal: "snapshot" };
  if (ts === "changes_by_period") return { type: DEFAULT_TYPE[section], temporal: "period" };
  if (section === "timeline") return { type: "event", temporal: "period" };
  if (section === "identity") return { type: "identity", temporal: "stable" };
  return { type: DEFAULT_TYPE[section], temporal: "unknown" };
}

/**
 * Seed "high" confidence mostly comes from assistant-written summaries; the architecture
 * says repeated AI summaries must not be treated as verified truth. Discount accordingly.
 */
export function mapConfidence(f: SeedFact): number {
  const base = f.confidence === "high" ? 0.9 : f.confidence === "medium" ? 0.65 : 0.4;
  const discount = f.source === "chat_history_summary" ? 0.2 : f.source === "account_history_caution" ? 0.1 : 0;
  const unverified = f.status.includes("unverified") ? 0.1 : 0;
  return Math.max(0.1, Math.round((base - discount - unverified) * 100) / 100);
}

export function mapSensitivity(f: SeedFact, section: Section): Sensitivity {
  if (f.sensitivity === "sensitive") return "sensitive";
  if (section === "health" || section === "relationships" || section === "family") return "sensitive";
  return "private"; // handling_rules.privacy_default
}

export function contentHash(parts: (string | null | undefined)[]): string {
  return createHash("sha256").update(parts.map((p) => p ?? "").join("␟")).digest("hex");
}

export type NormalizedSeed = {
  memories: Memory[];
  issues: { id: string; message: string }[];
  checksum: string;
};

export function normalizeSeed(raw: unknown): NormalizedSeed {
  const file = SeedFile.parse(raw);
  const compiled = file.compiled_at;
  const issues: NormalizedSeed["issues"] = [];
  const seen = new Set<string>();
  const memories: Memory[] = [];

  for (const f of file.facts) {
    if (seen.has(f.id)) {
      issues.push({ id: f.id, message: "Duplicate fact id in seed; skipped." });
      continue;
    }
    seen.add(f.id);

    const rule = SEED_RULES[f.id] ?? {};
    const section = toSection(f.section);
    if (section === "other") issues.push({ id: f.id, message: `Unknown section "${f.section}"` });
    const subjectId = SUBJECT_MAP[f.subject];
    if (!subjectId) issues.push({ id: f.id, message: `Unknown subject "${f.subject}", mapped to Aditya` });
    const { type, temporal } = classify(f);

    const isFuture = Boolean(f.as_of && f.as_of > compiled);
    const datedEvent =
      rule.eventIsAsOf || isFuture || ["event", "plan", "metric", "goal"].includes(type) || section === "timeline";
    const eventAt = datedEvent ? f.as_of : null;
    const observedAt = f.as_of && !isFuture ? f.as_of : compiled;

    const mentioned = detectEntities(f.statement);
    const entityIds = new Set<string>([subjectId ?? "person:aditya", ...mentioned]);
    if (f.subject === "meow_chikku") entityIds.add("pet:chikku");
    if (f.subject === "family") entityIds.add("person:mother");
    for (const t of f.tags) {
      const proj = REGISTRY.find((e) => e.kind === "project" && e.aliases.some((a) => a.toLowerCase() === t.toLowerCase()));
      if (proj) entityIds.add(proj.id);
    }

    const tags = new Set<string>(f.tags.map((t) => t.toLowerCase()));
    for (const id of entityIds) if (id.startsWith("project:")) tags.add(id.slice("project:".length));

    const sensitivity = rule.sensitivity ?? mapSensitivity(f, section);
    const reviewNotes = [...(rule.notes ?? [])];
    if (f.source === "chat_history_summary")
      reviewNotes.push("From an assistant-written summary. Verify before treating as fact.");

    const memory: Memory = {
      _id: `seed:${f.id}`,
      ownerId: OWNER_ID,
      subjectId: subjectId ?? "person:aditya",
      statement: f.statement,
      type,
      section,
      topic: null,
      entityIds: [...entityIds],
      tags: [...tags],
      observedAt,
      eventAt,
      validFrom: f.as_of && !isFuture ? f.as_of : null,
      validTo: null,
      temporal,
      confidence: mapConfidence(f),
      status: rule.mergedInto ? "merged" : "active",
      reviewStatus: "pending",
      sensitivity,
      isInferred: false,
      sources: [
        {
          kind: "seed",
          ref: `aditya-knowledge.json#${f.id}`,
          label: `Seed ${f.id} · ${f.source.replace(/_/g, " ")}`,
          excerpt: f.statement,
          at: f.as_of,
        },
      ],
      provenance: {
        origin: "seed",
        seedId: f.id,
        seedSource: f.source,
        seedStatus: f.status,
        seedConfidence: f.confidence,
        seedTemporalState: f.temporal_state,
        contentHash: contentHash([f.statement, f.section, f.subject, f.as_of, f.status, f.sensitivity]),
      },
      supersedes: [],
      supersededBy: null,
      mergedInto: rule.mergedInto ? `seed:${rule.mergedInto}` : null,
      reviewNotes,
      pinned: false,
      humanEdited: false,
      version: 1,
      createdAt: compiled,
      updatedAt: compiled,
    };
    memories.push(memory);
  }

  const checksum = contentHash(file.facts.map((f) => `${f.id}:${f.statement}`));
  return { memories, issues, checksum };
}
