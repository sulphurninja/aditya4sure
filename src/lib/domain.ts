/**
 * Shared, client-safe domain types and schemas.
 * Server-only persistence lives in src/lib/server/*.
 */
import { z } from "zod";

export const OWNER_ID = "owner";
export const SELF_ID = "person:aditya";

export const MEMORY_TYPES = [
  "identity",
  "preference",
  "habit",
  "experience",
  "event",
  "belief",
  "goal",
  "commitment",
  "skill",
  "relationship",
  "project_fact",
  "decision",
  "style",
  "insight",
  "metric",
  "plan",
  "account",
] as const;
export type MemoryType = (typeof MEMORY_TYPES)[number];

export const SECTIONS = [
  "identity",
  "accounts",
  "career",
  "people",
  "projects",
  "goals",
  "planning",
  "relationships",
  "family",
  "pets",
  "health",
  "creativity",
  "tools",
  "communication",
  "timeline",
  "money",
  "other",
] as const;
export type Section = (typeof SECTIONS)[number];

export const SENSITIVITY = ["normal", "private", "sensitive"] as const;
export type Sensitivity = (typeof SENSITIVITY)[number];

export const REVIEW_STATUS = ["pending", "accepted", "rejected"] as const;
export type ReviewStatus = (typeof REVIEW_STATUS)[number];

export const MEMORY_STATUS = ["active", "superseded", "merged", "redacted"] as const;
export type MemoryStatus = (typeof MEMORY_STATUS)[number];

/** How a fact relates to time, drives "historical vs current" answers. */
export const TEMPORAL = ["stable", "snapshot", "period", "plan", "goal", "unknown"] as const;
export type Temporal = (typeof TEMPORAL)[number];

export const ENTITY_KINDS = ["person", "project", "pet", "organization", "place"] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

export const PERSONA_MODES = ["assistant", "personal", "professional", "affectionate", "creative"] as const;
export type PersonaMode = (typeof PERSONA_MODES)[number];

export type SourceRef = {
  kind: "seed" | "chat" | "manual" | "extraction" | "import";
  ref: string;
  label: string;
  excerpt?: string;
  at?: string | null;
};

export type Memory = {
  _id: string;
  ownerId: string;
  subjectId: string;
  statement: string;
  type: MemoryType;
  section: Section;
  topic?: string | null;
  entityIds: string[];
  tags: string[];
  observedAt: string | null;
  eventAt: string | null;
  validFrom: string | null;
  validTo: string | null;
  temporal: Temporal;
  confidence: number;
  status: MemoryStatus;
  reviewStatus: ReviewStatus;
  sensitivity: Sensitivity;
  isInferred: boolean;
  sources: SourceRef[];
  provenance: {
    origin: "seed" | "manual" | "chat_extraction" | "correction" | "import";
    seedId?: string;
    seedSource?: string;
    seedStatus?: string;
    seedConfidence?: string;
    seedTemporalState?: string;
    contentHash: string;
  };
  supersedes: string[];
  supersededBy: string | null;
  mergedInto: string | null;
  reviewNotes: string[];
  pinned: boolean;
  humanEdited: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type Entity = {
  _id: string;
  ownerId: string;
  kind: EntityKind;
  name: string;
  slug: string;
  aliases: string[];
  relationship?: string | null;
  description?: string | null;
  sensitivity: Sensitivity;
  /** True for people whose own content must never merge into the owner's profile. */
  identityBoundary?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Edge = {
  _id: string;
  ownerId: string;
  from: string;
  to: string;
  type: string;
  label: string;
  sourceMemoryIds: string[];
};

export type ChatCitation = {
  id: string;
  /** The [M#] label the model saw for this memory in its turn. */
  label: string;
  statement: string;
  section: Section;
  when: string | null;
  temporal: Temporal;
  reviewStatus: ReviewStatus;
  sensitivity: Sensitivity;
  sourceLabel: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: ChatCitation[];
  model?: string;
  at: string;
};

export const WALLPAPER_PRESETS = ["aurora", "midnight", "sunset", "lavender", "hearts", "dots", "grid", "ocean"] as const;
export type WallpaperPreset = (typeof WALLPAPER_PRESETS)[number];

export type Wallpaper =
  | { kind: "none" }
  | { kind: "preset"; id: WallpaperPreset }
  | { kind: "image"; id: string; dim: number; blur: number };

export const WallpaperInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }),
  z.object({ kind: z.literal("preset"), id: z.enum(WALLPAPER_PRESETS) }),
  z.object({
    kind: z.literal("image"),
    id: z.string().regex(/^wp_[a-f0-9]{16}$/),
    dim: z.number().min(0).max(0.9).default(0.45),
    blur: z.number().min(0).max(24).default(0),
  }),
]);

export type Conversation = {
  _id: string;
  ownerId: string;
  title: string;
  mode: PersonaMode;
  messages: ChatMessage[];
  /** When set, this chat can also search messages from an imported WhatsApp/Instagram thread. */
  threadId?: string | null;
  wallpaper?: Wallpaper;
  /** Where it happened: typed chat or a voice session at /talk (both share the same history). */
  channel?: "text" | "voice";
  createdAt: string;
  updatedAt: string;
};

/* ---------- imported chats (WhatsApp / Instagram) ---------- */

export const THREAD_SOURCES = ["whatsapp", "instagram"] as const;
export type ThreadSource = (typeof THREAD_SOURCES)[number];

export type ImportedThread = {
  _id: string;
  ownerId: string;
  source: ThreadSource;
  key: string;
  title: string;
  participants: string[];
  /** Which participant name is Aditya in this export. */
  selfName: string | null;
  /** Entity this chat is mainly with, e.g. person:komal. */
  entityId: string | null;
  messageCount: number;
  selfCount: number;
  mediaCount?: number;
  mediaAnalyzed?: number;
  firstAt: string | null;
  lastAt: string | null;
  wallpaper?: Wallpaper;
  consentAt: string;
  createdAt: string;
  updatedAt: string;
};

export type StoredRawMessage = {
  _id: string;
  ownerId: string;
  threadId: string;
  at: string;
  sender: string;
  kind: "text" | "media" | "system" | "deleted";
  edited: boolean;
  /** AES-256-GCM ciphertext of the message text. Never stored in plaintext. */
  textCiphertext: string;
  length: number;
  /** File name inside the export (e.g. IMG-20261113-WA0004.jpg). */
  attachment?: string | null;
  mediaId?: string | null;
};

export type MediaKind = "image" | "video" | "audio" | "sticker" | "document";

export type StoredMedia = {
  _id: string;
  ownerId: string;
  threadId: string;
  messageId: string;
  kind: MediaKind;
  attachment: string;
  at: string;
  sender: string;
  /** True when a downscaled JPEG exists in the encrypted on-disk store (never in the DB). */
  hasImage: boolean;
  /** Legacy: images used to live in the DB. Migrated to disk. */
  imageCiphertext?: string | null;
  bytes: number;
  width: number;
  height: number;
  status: "pending" | "done" | "failed" | "skipped";
  /** Encrypted JSON {description, tags, visibleText} written by Claude vision. */
  analysisCiphertext: string | null;
  analysisModel: string | null;
  error: string | null;
  createdAt: string;
  analyzedAt: string | null;
};

export type MediaInfo = { id: string; kind: MediaKind; status: StoredMedia["status"]; description: string | null; tags: string[]; visibleText: string | null };

export type ThreadMessage = Omit<StoredRawMessage, "textCiphertext" | "ownerId"> & { text: string; isSelf: boolean; media?: MediaInfo | null };

export const ParsedMessageSchema = z.object({
  at: z.string().datetime({ offset: true }),
  sender: z.string().min(1).max(120),
  text: z.string().max(20000),
  kind: z.enum(["text", "media", "system", "deleted"]),
  edited: z.boolean().default(false),
  dup: z.number().int().min(0).max(10000).default(0),
  attachment: z.string().max(400).optional(),
});
export type ParsedMessageInput = z.infer<typeof ParsedMessageSchema>;

export const ThreadCreateInput = z.object({
  source: z.enum(THREAD_SOURCES),
  title: z.string().trim().min(1).max(160),
  participants: z.array(z.string().trim().min(1).max(120)).min(1).max(300),
  selfName: z.string().trim().max(120).nullable(),
  consent: z.literal(true),
});

export const ThreadPatchInput = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  selfName: z.string().trim().max(120).nullable().optional(),
  entityId: z.string().max(80).nullable().optional(),
  wallpaper: WallpaperInput.optional(),
});

export type StyleSample = {
  _id: string;
  ownerId: string;
  mode: Exclude<PersonaMode, "assistant">;
  text: string;
  context?: string | null;
  audience?: string | null;
  /** Set when the sample was taken from an imported chat thread. */
  sourceThreadId?: string | null;
  authoredBy: "aditya";
  createdAt: string;
};

export type Proposal = {
  _id: string;
  ownerId: string;
  status: "pending" | "approved" | "rejected";
  candidate: {
    statement: string;
    type: MemoryType;
    section: Section;
    subjectId: string;
    sensitivity: Sensitivity;
    temporal: Temporal;
    eventAt: string | null;
    confidence: number;
    isInferred: boolean;
    evidenceQuote: string;
    reason: string;
  };
  conflictsWith: { id: string; statement: string }[];
  duplicateOf: string | null;
  sourceConversationId: string;
  createdAt: string;
};

export type AuditEntry = {
  _id: string;
  ownerId: string;
  actor: "owner" | "system" | "ai";
  action: string;
  targetType: string;
  targetId: string;
  changedFields?: string[];
  note?: string;
  at: string;
};

/* ---------- input schemas (validated on every API route) ---------- */

const dateish = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}/, "Expected YYYY-MM-DD")
  .nullable()
  .optional();

export const MemoryCreateInput = z.object({
  statement: z.string().trim().min(3).max(2000),
  type: z.enum(MEMORY_TYPES),
  section: z.enum(SECTIONS),
  subjectId: z.string().min(3).max(80).default(SELF_ID),
  sensitivity: z.enum(SENSITIVITY).default("private"),
  temporal: z.enum(TEMPORAL).default("unknown"),
  eventAt: dateish,
  validFrom: dateish,
  validTo: dateish,
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  entityIds: z.array(z.string().max(80)).max(30).default([]),
  confidence: z.number().min(0).max(1).default(0.95),
});
export type MemoryCreateInput = z.infer<typeof MemoryCreateInput>;

/**
 * No defaults: a correction only changes the fields it names. (zod's .partial() keeps .default()s,
 * which used to reset subject, tags, links, sensitivity and temporal on every text-only correction.)
 */
export const MemoryCorrectInput = z.object({
  statement: z.string().trim().min(3).max(2000).optional(),
  type: z.enum(MEMORY_TYPES).optional(),
  section: z.enum(SECTIONS).optional(),
  subjectId: z.string().min(3).max(80).optional(),
  sensitivity: z.enum(SENSITIVITY).optional(),
  temporal: z.enum(TEMPORAL).optional(),
  eventAt: dateish,
  validFrom: dateish,
  validTo: dateish,
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  entityIds: z.array(z.string().max(80)).max(30).optional(),
  confidence: z.number().min(0).max(1).optional(),
  reason: z.string().trim().max(500).optional(),
});

export const MemoryActionInput = z.object({
  action: z.enum(["approve", "reject", "redact", "pin", "unpin", "restore"]),
  note: z.string().trim().max(500).optional(),
});

export const MemoryQueryInput = z.object({
  q: z.string().trim().max(200).optional(),
  section: z.enum(SECTIONS).optional(),
  entity: z.string().max(80).optional(),
  review: z.enum(REVIEW_STATUS).optional(),
  sensitivity: z.enum(SENSITIVITY).optional(),
  temporal: z.enum(TEMPORAL).optional(),
  includeInactive: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export const ChatInput = z.object({
  conversationId: z.string().max(80).nullable().optional(),
  threadId: z.string().max(80).nullable().optional(),
  message: z.string().trim().min(1).max(8000),
  mode: z.enum(PERSONA_MODES).default("assistant"),
  includeSensitive: z.boolean().default(true),
  /** Voice mode: the reply gets spoken aloud, so keep it short and sayable. */
  voice: z.boolean().default(false),
});

export const StyleSampleInput = z.object({
  mode: z.enum(["personal", "professional", "affectionate", "creative"]),
  text: z.string().trim().min(3).max(4000),
  context: z.string().trim().max(500).optional(),
  audience: z.string().trim().max(120).optional(),
});

export const SeedImportInput = z.object({
  dryRun: z.boolean().default(true),
  excludeSensitive: z.boolean().default(false),
  excludeIds: z.array(z.string().max(20)).max(200).default([]),
});

/* ---------- display helpers ---------- */

export const SECTION_LABEL: Record<Section, string> = {
  identity: "Identity",
  accounts: "Accounts",
  career: "Career",
  people: "People",
  projects: "Projects",
  goals: "Goals",
  planning: "Planning",
  relationships: "Relationships",
  family: "Family",
  pets: "Pets",
  health: "Health",
  creativity: "Creative",
  tools: "Tools & Craft",
  communication: "Voice & Communication",
  timeline: "Timeline",
  money: "Money",
  other: "Other",
};

export const TEMPORAL_LABEL: Record<Temporal, string> = {
  stable: "Stable",
  snapshot: "Snapshot · historical",
  period: "Time-bound",
  plan: "Plan",
  goal: "Goal",
  unknown: "Currency unknown",
};

/** A live, data-driven prompt on the home screen. */
export type Nudge = {
  icon: "calendar" | "hourglass" | "review" | "voice" | "chats" | "seed";
  text: string;
  /** Either navigate somewhere or drop a prompt into the chat. */
  href?: string;
  prompt?: string;
  sensitive?: boolean;
};


/* ---------- tasks: todos, commitments, follow-ups (Jarvis layer) ---------- */

export const TASK_KINDS = ["todo", "commitment", "followup", "reminder"] as const;
export type TaskKind = (typeof TASK_KINDS)[number];
export const TASK_STATUS = ["open", "done", "dropped"] as const;
export type TaskStatus = (typeof TASK_STATUS)[number];
export const TASK_AREAS = ["work", "business", "personal", "money", "health", "relationships", "creative", "learning"] as const;
export type TaskArea = (typeof TASK_AREAS)[number];

export type Task = {
  _id: string;
  ownerId: string;
  title: string;
  notes: string | null;
  kind: TaskKind;
  area: TaskArea;
  status: TaskStatus;
  priority: 1 | 2 | 3;
  /** YYYY-MM-DD or full ISO time. */
  due: string | null;
  /** Time of day it happens, HH:MM in IST (e.g. a 15:00 meeting). */
  at?: string | null;
  /** When to ping him (UTC ISO). The scheduler sends it to WhatsApp / the app. */
  remindAt?: string | null;
  /** Set once the reminder went out, so it never fires twice. */
  remindedAt?: string | null;
  /** How the last reminder was delivered (WhatsApp text / voice note outcome). */
  reminderLog?: { whatsapp: string; voice: string; at: string } | null;
  /** Linked people/projects, e.g. person:komal, project:zaptick. */
  entityIds: string[];
  /** Where it came from: "app", "claude", "gmail:<threadId>"... */
  source: string;
  createdAt: string;
  updatedAt: string;
  doneAt: string | null;
};

export const TaskCreateInput = z.object({
  title: z.string().trim().min(2).max(300),
  notes: z.string().trim().max(4000).nullable().optional(),
  kind: z.enum(TASK_KINDS).default("todo"),
  area: z.enum(TASK_AREAS).default("work"),
  priority: z.coerce.number().int().min(1).max(3).default(2),
  due: z.string().regex(/^\d{4}-\d{2}-\d{2}/, "Expected YYYY-MM-DD").nullable().optional(),
  entityIds: z.array(z.string().max(80)).max(10).default([]),
  source: z.string().trim().max(200).default("app"),
  at: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  remindAt: z.string().datetime().nullable().optional(),
});

/** No defaults here: a patch must only touch the fields it names (zod's .partial() would keep them). */
export const TaskPatchInput = z.object({
  title: z.string().trim().min(2).max(300).optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
  kind: z.enum(TASK_KINDS).optional(),
  area: z.enum(TASK_AREAS).optional(),
  priority: z.coerce.number().int().min(1).max(3).optional(),
  due: z.string().regex(/^\d{4}-\d{2}-\d{2}/, "Expected YYYY-MM-DD").nullable().optional(),
  entityIds: z.array(z.string().max(80)).max(10).optional(),
  status: z.enum(TASK_STATUS).optional(),
  at: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  remindAt: z.string().datetime().nullable().optional(),
});

/* ---------- personal money (ledger, IOUs, savings goals) ---------- */

/**
 * income      money that came to him (payout from Zaptick, a project, a client, a gift)
 * expense     money he spent
 * lent        he gave someone money they should return        borrowed  someone gave him money he should return
 * got_back    someone repaid him                               paid_back he repaid someone
 * saving      money set aside / invested toward a goal (SIP, flat fund)
 */
export const MONEY_KINDS = ["income", "expense", "lent", "borrowed", "got_back", "paid_back", "saving"] as const;
export type MoneyKind = (typeof MONEY_KINDS)[number];
export const MONEY_CATEGORIES = [
  "food",
  "travel",
  "rent",
  "bills",
  "subscriptions",
  "shopping",
  "dates",
  "gifts",
  "family",
  "health",
  "fun",
  "work",
  "education",
  "fees",
  "other",
] as const;
export type MoneyCategory = (typeof MONEY_CATEGORIES)[number];

export type MoneyEntry = {
  _id: string;
  ownerId: string;
  kind: MoneyKind;
  /** Rupees (INR). Foreign amounts are converted when logged; the original is kept in `foreign`. */
  amount: number;
  foreign: { amount: number; currency: string } | null;
  /** YYYY-MM-DD (IST). */
  date: string;
  title: string;
  /** Income source: "Zaptick", "Ocean Linux", a client... */
  source: string | null;
  /** Project this belongs to, e.g. project:zaptick. */
  projectId: string | null;
  category: MoneyCategory | null;
  /** Person on the other side (IOUs, gifts, transfers): entity id when known, else their name. */
  counterparty: string | null;
  /** kotak, cash, usdt, upi... */
  account: string | null;
  goalId: string | null;
  /** "expected" = not received/paid yet (upcoming payout, bill). */
  status: "done" | "expected";
  note: string | null;
  via: string;
  createdAt: string;
  updatedAt: string;
};

export type MoneyGoal = {
  _id: string;
  ownerId: string;
  name: string;
  target: number;
  /** Already saved before tracking started (he sets this). Contributions = `saving` entries with this goalId. */
  startingAmount: number;
  deadline: string | null;
  note: string | null;
  status: "active" | "done" | "dropped";
  createdAt: string;
  updatedAt: string;
};

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

export const MoneyEntryInput = z.object({
  kind: z.enum(MONEY_KINDS),
  amount: z.coerce.number().positive().max(1e9),
  foreign: z.object({ amount: z.coerce.number().positive(), currency: z.string().trim().min(2).max(8) }).nullable().optional(),
  date: ymd,
  title: z.string().trim().min(1).max(200),
  source: z.string().trim().max(80).nullable().optional(),
  projectId: z.string().max(80).nullable().optional(),
  category: z.enum(MONEY_CATEGORIES).nullable().optional(),
  counterparty: z.string().trim().max(80).nullable().optional(),
  account: z.string().trim().max(40).nullable().optional(),
  goalId: z.string().max(80).nullable().optional(),
  status: z.enum(["done", "expected"]).default("done"),
  note: z.string().trim().max(1000).nullable().optional(),
  via: z.string().trim().max(40).default("app"),
});

/** Explicit (no defaults) so an edit only touches what it names. */
export const MoneyEntryPatch = z.object({
  kind: z.enum(MONEY_KINDS).optional(),
  amount: z.coerce.number().positive().max(1e9).optional(),
  date: ymd.optional(),
  title: z.string().trim().min(1).max(200).optional(),
  source: z.string().trim().max(80).nullable().optional(),
  projectId: z.string().max(80).nullable().optional(),
  category: z.enum(MONEY_CATEGORIES).nullable().optional(),
  counterparty: z.string().trim().max(80).nullable().optional(),
  account: z.string().trim().max(40).nullable().optional(),
  goalId: z.string().max(80).nullable().optional(),
  status: z.enum(["done", "expected"]).optional(),
  note: z.string().trim().max(1000).nullable().optional(),
});

export const MoneyGoalInput = z.object({
  name: z.string().trim().min(2).max(80),
  target: z.coerce.number().positive().max(1e10),
  startingAmount: z.coerce.number().min(0).max(1e10).default(0),
  deadline: ymd.nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

export const MoneyGoalPatch = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  target: z.coerce.number().positive().max(1e10).optional(),
  startingAmount: z.coerce.number().min(0).max(1e10).optional(),
  deadline: ymd.nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
  status: z.enum(["active", "done", "dropped"]).optional(),
});

/** "I'm left with 14k" on a date: the anchor for "how much do I have right now". */
export type MoneyBalance = {
  _id: string;
  ownerId: string;
  amount: number;
  date: string;
  note: string | null;
  via: string;
  createdAt: string;
};

export const MoneyBalanceInput = z.object({
  amount: z.coerce.number().min(-1e9).max(1e10),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
  note: z.string().trim().max(300).nullable().optional(),
  via: z.string().trim().max(40).default("app"),
});
