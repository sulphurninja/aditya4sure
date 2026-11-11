import "server-only";
import type { Collection, Document } from "mongodb";
import { getDb } from "./mongo";
import type {
  AuditEntry,
  Conversation,
  Edge,
  Entity,
  ImportedThread,
  Memory,
  StoredMedia,
  StoredRawMessage,
  Proposal,
  StyleSample,
  Task,
  MoneyEntry,
  MoneyGoal,
  MoneyBalance,
} from "@/lib/domain";

/**
 * Dates are stored as ISO-8601 strings (YYYY-MM-DD or full timestamps) so they sort
 * lexicographically, serialize to the client unchanged and compare correctly in filters.
 */
export type ImportRun = {
  _id: string;
  ownerId: string;
  kind: "seed" | "chatgpt" | "whatsapp" | "gmail";
  checksum: string;
  summary: Record<string, number>;
  at: string;
};

export type ConnectedAccount = {
  _id: string;
  ownerId: string;
  provider: "google";
  address: string;
  addressKind: "unknown" | "mailbox" | "alias" | "shared" | "group" | "non_google";
  status: "not_connected" | "connected" | "revoked" | "error";
  scopes: string[];
  tokenCiphertext: string | null;
  lastSyncAt: string | null;
  createdAt: string;
};

export type WallpaperBlob = {
  _id: string;
  ownerId: string;
  mime: "image/jpeg" | "image/webp" | "image/png";
  /** Legacy (pre disk store). The image itself lives encrypted on disk. */
  ciphertext?: string;
  bytes: number;
  createdAt: string;
};

type Collections = {
  threads: Collection<ImportedThread>;
  media: Collection<StoredMedia>;
  rawMessages: Collection<StoredRawMessage>;
  wallpapers: Collection<WallpaperBlob>;
  memories: Collection<Memory>;
  entities: Collection<Entity>;
  edges: Collection<Edge>;
  conversations: Collection<Conversation>;
  proposals: Collection<Proposal>;
  styleSamples: Collection<StyleSample>;
  audit: Collection<AuditEntry>;
  imports: Collection<ImportRun>;
  accounts: Collection<ConnectedAccount>;
  rateLimits: Collection<{ _id: string; count: number; resetAt: Date }>;
  tasks: Collection<Task>;
  money: Collection<MoneyEntry>;
  moneyGoals: Collection<MoneyGoal>;
  moneyBalances: Collection<MoneyBalance>;
};

let indexesReady: Promise<void> | null = null;

export async function collections(): Promise<Collections> {
  const db = await getDb();
  const c: Collections = {
    threads: db.collection<ImportedThread>("imported_threads"),
    media: db.collection<StoredMedia>("media"),
    rawMessages: db.collection<StoredRawMessage>("raw_messages"),
    wallpapers: db.collection<WallpaperBlob>("wallpapers"),
    memories: db.collection<Memory>("memories"),
    entities: db.collection<Entity>("entities"),
    edges: db.collection<Edge>("entity_edges"),
    conversations: db.collection<Conversation>("agent_conversations"),
    proposals: db.collection<Proposal>("review_queue"),
    styleSamples: db.collection<StyleSample>("style_samples"),
    audit: db.collection<AuditEntry>("audit_logs"),
    imports: db.collection<ImportRun>("sync_jobs"),
    accounts: db.collection<ConnectedAccount>("connected_accounts"),
    rateLimits: db.collection("rate_limits"),
    tasks: db.collection<Task>("tasks"),
    money: db.collection<MoneyEntry>("money"),
    moneyGoals: db.collection<MoneyGoal>("money_goals"),
    moneyBalances: db.collection<MoneyBalance>("money_balances"),
  };
  if (!indexesReady) {
    indexesReady = ensureIndexes(c).catch((err) => {
      indexesReady = null;
      throw err;
    });
  }
  await indexesReady;
  return c;
}

async function ensureIndexes(c: Collections) {
  await Promise.all([
    c.threads.createIndexes([
      { key: { ownerId: 1, key: 1 }, name: "owner_key", unique: true },
      { key: { ownerId: 1, lastAt: -1 }, name: "owner_recent" },
    ]),
    c.rawMessages.createIndexes([
      { key: { ownerId: 1, threadId: 1, at: -1 }, name: "owner_thread_time" },
      { key: { ownerId: 1, threadId: 1, sender: 1 }, name: "owner_thread_sender" },
    ]),
    c.media.createIndexes([
      { key: { ownerId: 1, threadId: 1, status: 1, at: 1 }, name: "owner_thread_status" },
      { key: { ownerId: 1, messageId: 1 }, name: "owner_message", unique: true },
    ]),
    c.wallpapers.createIndexes([{ key: { ownerId: 1, createdAt: -1 }, name: "owner_recent" }]),
    c.memories.createIndexes([
      { key: { ownerId: 1, status: 1, reviewStatus: 1, updatedAt: -1 }, name: "owner_status" },
      { key: { ownerId: 1, section: 1 }, name: "owner_section" },
      { key: { ownerId: 1, entityIds: 1 }, name: "owner_entities" },
      { key: { ownerId: 1, subjectId: 1 }, name: "owner_subject" },
      { key: { ownerId: 1, eventAt: -1 }, name: "owner_event_date" },
      { key: { ownerId: 1, "provenance.seedId": 1 }, name: "owner_seed", unique: true, partialFilterExpression: { "provenance.seedId": { $exists: true } } },
      { key: { ownerId: 1, "provenance.contentHash": 1 }, name: "owner_hash" },
      {
        key: { statement: "text", tags: "text", topic: "text" } as Document,
        name: "memory_text",
        weights: { statement: 10, tags: 5, topic: 3 },
        default_language: "none",
      },
    ]),
    c.entities.createIndexes([
      { key: { ownerId: 1, kind: 1, slug: 1 }, name: "owner_kind_slug", unique: true },
      { key: { ownerId: 1, aliases: 1 }, name: "owner_aliases" },
    ]),
    c.edges.createIndexes([{ key: { ownerId: 1, from: 1, to: 1, type: 1 }, name: "owner_edge", unique: true }]),
    c.conversations.createIndexes([{ key: { ownerId: 1, updatedAt: -1 }, name: "owner_recent" }]),
    c.tasks.createIndexes([
      { key: { ownerId: 1, status: 1, due: 1 }, name: "owner_status_due" },
      { key: { ownerId: 1, entityIds: 1 }, name: "owner_entities" },
    ]),
    c.money.createIndexes([
      { key: { ownerId: 1, date: -1 }, name: "owner_date" },
      { key: { ownerId: 1, counterparty: 1, kind: 1 }, name: "owner_counterparty" },
      { key: { ownerId: 1, goalId: 1 }, name: "owner_goal" },
    ]),
    c.moneyGoals.createIndexes([{ key: { ownerId: 1, status: 1 }, name: "owner_status" }]),
    c.moneyBalances.createIndexes([{ key: { ownerId: 1, date: -1, createdAt: -1 }, name: "owner_recent" }]),
    c.proposals.createIndexes([{ key: { ownerId: 1, status: 1, createdAt: -1 }, name: "owner_status" }]),
    c.styleSamples.createIndexes([{ key: { ownerId: 1, mode: 1, createdAt: -1 }, name: "owner_mode" }]),
    c.audit.createIndexes([
      { key: { ownerId: 1, at: -1 }, name: "owner_recent" },
      { key: { ownerId: 1, targetId: 1, at: -1 }, name: "owner_target" },
    ]),
    c.accounts.createIndexes([{ key: { ownerId: 1, address: 1 }, name: "owner_address", unique: true }]),
    c.rateLimits.createIndexes([{ key: { resetAt: 1 }, name: "ttl", expireAfterSeconds: 0 }]),
  ]);
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(prefix: string): string {
  const rand = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  return `${prefix}_${rand}`;
}
