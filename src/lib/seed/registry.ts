import type { EntityKind, Sensitivity } from "@/lib/domain";

export type RegistryEntity = {
  id: string;
  kind: EntityKind;
  name: string;
  slug: string;
  aliases: string[];
  relationship: string | null;
  description: string | null;
  sensitivity: Sensitivity;
  identityBoundary?: boolean;
};

/**
 * Canonical entities for the seed. Aliases drive retrieval (person/project matching)
 * and are matched on word boundaries, case-insensitively.
 */
export const REGISTRY: RegistryEntity[] = [
  {
    id: "person:aditya",
    kind: "person",
    name: "Aditya Pingle",
    slug: "aditya",
    aliases: ["Aditya Pingle", "aditya4sure", "sulphurninja"],
    relationship: "self",
    description: "Owner of this brain. Founder/CTO building across Zaptick, Backtick Labs and more.",
    sensitivity: "private",
  },
  {
    id: "person:komal",
    kind: "person",
    name: "Komal",
    slug: "komal",
    aliases: ["Komal", "baby shark", "komal_khandelwal13", "gf", "girlfriend", "my girl", "bae", "babe", "baby", "bubu", "bubi", "babes"],
    relationship: "girlfriend",
    description: "Aditya's girlfriend (\"baby shark\"), based in Pune.",
    sensitivity: "sensitive",
  },
  {
    id: "person:shubhodeep",
    kind: "person",
    name: "Shubhodeep Banerjee",
    slug: "shubhodeep",
    aliases: ["Shubhodeep Banerjee", "Shubhodeep"],
    relationship: "co-founder / Zaptick CEO",
    description: "Zaptick CEO and close collaborator in Kolkata.",
    sensitivity: "private",
  },
  {
    id: "person:umesh",
    kind: "person",
    name: "Umesh",
    slug: "umesh",
    aliases: ["Umesh"],
    relationship: "business collaborator",
    description: "COO figure in the Zaptick/Backtick context. Exact title unverified.",
    sensitivity: "private",
  },
  {
    id: "person:rugved",
    kind: "person",
    name: "Rugved",
    slug: "rugved",
    aliases: ["Rugved"],
    relationship: "colleague",
    description: "Zaptick operations.",
    sensitivity: "private",
  },
  {
    id: "person:amit-moga",
    kind: "person",
    name: "Amit Moga",
    slug: "amit-moga",
    aliases: ["Amit Moga"],
    relationship: "BuildBizAI collaborator",
    description: null,
    sensitivity: "private",
  },
  {
    id: "person:siddharth-rajsekar",
    kind: "person",
    name: "Siddharth Rajsekar",
    slug: "siddharth-rajsekar",
    aliases: ["Siddharth Rajsekar"],
    relationship: "community host (ILH)",
    description: "Runs the Internet Lifestyle Hub community.",
    sensitivity: "private",
  },
  {
    id: "person:anushka",
    kind: "person",
    name: "Anushka",
    slug: "anushka",
    aliases: ["Anushka"],
    relationship: "sister",
    description: null,
    sensitivity: "sensitive",
  },
  {
    id: "person:mother",
    kind: "person",
    name: "Mother",
    slug: "mother",
    aliases: ["mother", "mom", "Aai"],
    relationship: "mother",
    description:
      "Shares the ChatGPT account. Her first-person health, political and creator content is NOT Aditya's.",
    sensitivity: "sensitive",
    identityBoundary: true,
  },
  {
    id: "pet:meow",
    kind: "pet",
    name: "Meow",
    slug: "meow",
    aliases: ["Meow"],
    relationship: "cat",
    description: null,
    sensitivity: "private",
  },
  {
    id: "pet:chikku",
    kind: "pet",
    name: "Chikku",
    slug: "chikku",
    aliases: ["Chikku"],
    relationship: "kitten",
    description: null,
    sensitivity: "private",
  },
  {
    id: "project:zaptick",
    kind: "project",
    name: "Zaptick",
    slug: "zaptick",
    aliases: ["Zaptick", "ZapTick", "Zapllo", "zaptick.io", "zapllohq"],
    relationship: "CTO",
    description: "The operating system for customer communication. WhatsApp API SaaS and beyond.",
    sensitivity: "private",
  },
  {
    id: "project:backtick-labs",
    kind: "project",
    name: "Backtick Labs",
    slug: "backtick-labs",
    aliases: ["Backtick Labs", "Backtick", "backtick.app", "backticklabs"],
    relationship: "Founder & CEO",
    description: "Venture studio / product company.",
    sensitivity: "private",
  },
  {
    id: "project:ocean-linux",
    kind: "project",
    name: "Ocean Linux",
    slug: "ocean-linux",
    aliases: ["Ocean Linux", "oceanlinux", "oceanlinux.com"],
    relationship: "Co-founder",
    description: "Managed VPS hosting for developers and startups.",
    sensitivity: "private",
  },
  {
    id: "project:xseize",
    kind: "project",
    name: "XSeize",
    slug: "xseize",
    aliases: ["XSeize", "xseize.com"],
    relationship: "Explored",
    description: "Multi-tenant Voice AI exploration.",
    sensitivity: "private",
  },
  {
    id: "project:buildbizai",
    kind: "project",
    name: "BuildBizAI",
    slug: "buildbizai",
    aliases: ["BuildBizAI"],
    relationship: "Co-builder",
    description: "Productized industry SaaS codebases, with Amit Moga.",
    sensitivity: "private",
  },
  {
    id: "project:racket",
    kind: "project",
    name: "Racket",
    slug: "racket",
    aliases: ["Racket", "weareracket.com"],
    relationship: "Founder (planned)",
    description: "Premium D2C mechanical keyboard & desk lifestyle brand.",
    sensitivity: "private",
  },
  {
    id: "organization:ilh",
    kind: "organization",
    name: "Internet Lifestyle Hub",
    slug: "ilh",
    aliases: ["Internet Lifestyle Hub", "ILH"],
    relationship: "community",
    description: "Creator & coach community run by Siddharth Rajsekar.",
    sensitivity: "private",
  },
];

/** Seed `subject` field → entity id. */
export const SUBJECT_MAP: Record<string, string> = {
  aditya: "person:aditya",
  komal: "person:komal",
  shubhodeep: "person:shubhodeep",
  umesh: "person:umesh",
  rugved: "person:rugved",
  amit_moga: "person:amit-moga",
  siddharth_rajsekar: "person:siddharth-rajsekar",
  anushka: "person:anushka",
  mother: "person:mother",
  family: "person:aditya",
  meow_chikku: "pet:meow",
};

/** Relationship graph edges between canonical entities. */
export const EDGES: { from: string; to: string; type: string; label: string }[] = [
  { from: "person:aditya", to: "person:komal", type: "partner", label: "Partner" },
  { from: "person:aditya", to: "person:anushka", type: "family", label: "Sister" },
  { from: "person:aditya", to: "person:mother", type: "family", label: "Mother" },
  { from: "person:aditya", to: "pet:meow", type: "pet", label: "Cat" },
  { from: "person:aditya", to: "pet:chikku", type: "pet", label: "Kitten" },
  { from: "person:aditya", to: "person:shubhodeep", type: "collaborator", label: "Co-builds Zaptick" },
  { from: "person:aditya", to: "person:umesh", type: "collaborator", label: "Business collaborator" },
  { from: "person:aditya", to: "person:rugved", type: "colleague", label: "Zaptick colleague" },
  { from: "person:aditya", to: "person:amit-moga", type: "collaborator", label: "BuildBizAI" },
  { from: "person:aditya", to: "person:siddharth-rajsekar", type: "contact", label: "Met Oct 2026" },
  { from: "person:aditya", to: "project:zaptick", type: "role", label: "CTO" },
  { from: "person:aditya", to: "project:backtick-labs", type: "role", label: "Founder & CEO" },
  { from: "person:aditya", to: "project:ocean-linux", type: "role", label: "Co-founder" },
  { from: "person:aditya", to: "project:xseize", type: "role", label: "Explored" },
  { from: "person:aditya", to: "project:buildbizai", type: "role", label: "Co-builder" },
  { from: "person:aditya", to: "project:racket", type: "role", label: "Founder (planned)" },
  { from: "person:shubhodeep", to: "project:zaptick", type: "role", label: "CEO" },
  { from: "person:rugved", to: "project:zaptick", type: "role", label: "Operations" },
  { from: "person:umesh", to: "project:zaptick", type: "role", label: "COO (unverified)" },
  { from: "person:amit-moga", to: "project:buildbizai", type: "role", label: "Co-builder" },
  { from: "person:siddharth-rajsekar", to: "organization:ilh", type: "role", label: "Host" },
  { from: "project:ocean-linux", to: "project:backtick-labs", type: "venture_of", label: "Backtick venture" },
];

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const aliasMatchers = REGISTRY.flatMap((e) =>
  e.aliases.map((a) => ({ id: e.id, re: new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(a)}(?=$|[^\\p{L}\\p{N}])`, "iu") })),
);

/** Entity ids mentioned in free text, via alias word-boundary matching. */
export function detectEntities(text: string): string[] {
  const found = new Set<string>();
  for (const m of aliasMatchers) if (m.re.test(text)) found.add(m.id);
  return [...found];
}
