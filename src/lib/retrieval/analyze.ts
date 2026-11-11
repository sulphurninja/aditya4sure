import type { Section } from "@/lib/domain";
import { detectEntities } from "@/lib/seed/registry";

export type QueryAnalysis = {
  entities: string[];
  wantsCurrent: boolean;
  years: string[];
  sectionHints: Section[];
  terms: string[];
  mentionsMother: boolean;
  draftingRequest: boolean;
  /** Broad "tell me about myself" question: lead with work, goals, identity, not trivia. */
  broadSelf: boolean;
  /** About relationships / personal life, so chat-digest facts are welcome. */
  personal: boolean;
  /** "what's up lately / coming up / brief me": rank by date around today, not just by match. */
  wantsRecent: boolean;
};

const STOP = new Set(
  "a an the and or but if of to in on at by for with about from as is are was were be been being do does did have has had i me my mine we our you your he she it they them their this that these those what which who whom whose when where why how much many can could should would will shall may might must not no yes so than then there here just also into over under again more most some any all each few other such only own same too very s t don now tell give show please like want know".split(
    " ",
  ),
);

const SECTION_KEYWORDS: [RegExp, Section[]][] = [
  [/\b(mrr|arr|revenue|sales|users|customers|price|pricing|metrics?|growth)\b/i, ["projects", "goals", "money"]],
  [/\b(money|savings|finance|budget|profit|flat|apartment|emi|down ?payment|income)\b/i, ["goals", "money", "planning"]],
  [/\b(gym|workout|weight|height|health|sleep|diet|food|smok\w*|cigarette|skin\w*|protein|creatine)\b/i, ["health"]],
  [/\b(relationship|partner|girlfriend|date|gift|anniversary|love|romantic)\b/i, ["relationships"]],
  [/\b(sister|family|mom|mother|dad|father|home|beed)\b/i, ["family"]],
  [/\b(write|draft|email|message|caption|post|tone|voice|style|reply|outreach|linkedin)\b/i, ["communication"]],
  [/\b(lyrics?|rap|bars?|song|music|beat|reel|video|creative)\b/i, ["creativity"]],
  [/\b(goal|ambition|target|plan|dream|vision)\b/i, ["goals", "planning"]],
  [/\b(job|role|cto|ceo|founder|career|work history|bio)\b/i, ["career", "identity"]],
  [/\b(who am i|about me|myself|identity|born|birthday|age|languages?)\b/i, ["identity", "career", "projects", "goals"]],
  [/\b(stack|code|coding|tools?|tech|next\.?js|mongodb|aws)\b/i, ["tools", "projects"]],
  [/\b(cat|kitten|pets?)\b/i, ["pets"]],
  [/\b(timeline|history|evolve|evolved|journey|when did)\b/i, ["timeline"]],
];

export function analyzeQuery(q: string): QueryAnalysis {
  const entities = detectEntities(q);
  const wantsCurrent = /\b(today|now|current(ly)?|latest|right now|these days|at the moment|as of now)\b/i.test(q);
  const years = [...q.matchAll(/\b(20\d{2})\b/g)].map((m) => m[1]);
  const sectionHints = [...new Set(SECTION_KEYWORDS.flatMap(([re, s]) => (re.test(q) ? s : [])))];
  const terms = [
    ...new Set(
      q
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s.@₹-]/gu, " ")
        .split(/\s+/)
        .map((t) => t.replace(/^[.-]+|[.-]+$/g, ""))
        .filter((t) => t.length > 1 && !STOP.has(t)),
    ),
  ].slice(0, 16);
  const mentionsMother = entities.includes("person:mother") || /\b(mom|mother|aai|mummy)\b/i.test(q);
  const draftingRequest = /\b(draft|write|compose|reply|caption|message|email|bars?|lyrics?)\b/i.test(q);
  const broadSelf = /\b(who am i|about me|about myself|describe me|tell me about (me|myself)|my life|summari[sz]e me)\b/i.test(q);
  const personal =
    entities.some((e) => e !== "person:aditya") ||
    /\b(gf|girlfriend|babe|bae|baby|love|relationship|date|gift|tattoo|wallet|colou?r|favou?rite|food|eat|likes?|hate|family|mom|sister|friends?|feel|fight|miss)\b/i.test(q);
  const wantsRecent =
    /^\s*\/brief\b/i.test(q) ||
    /\b(recent(ly)?|lately|latest|today|tonight|tomorrow|this (week|weekend|month)|next (week|few days|month)|upcoming|coming up|these days|right now|what'?s up|what'?s new|update me|catch me up|brief( me)?|agenda|schedule|plans?|todos?|to-?dos?|due)\b/i.test(q);
  return { entities, wantsCurrent, years, sectionHints, terms, mentionsMother, draftingRequest, broadSelf, personal, wantsRecent };
}
