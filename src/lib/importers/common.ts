export type ParsedMessage = {
  at: string; // ISO-8601 UTC
  sender: string;
  text: string;
  kind: "text" | "media" | "system" | "deleted";
  edited: boolean;
  /** File the message points to inside the export (photos, videos, voice notes…). */
  attachment?: string;
  /** Occurrence index among identical (at, sender, text) messages, makes re-imports idempotent. */
  dup: number;
};

export type ParsedThread = {
  source: "whatsapp" | "instagram";
  title: string;
  participants: string[];
  messages: ParsedMessage[];
  warnings: string[];
};

/** Assign stable duplicate indices so identical messages in the same minute don't collapse or duplicate. */
export function assignDupIndices(messages: Omit<ParsedMessage, "dup">[]): ParsedMessage[] {
  const seen = new Map<string, number>();
  return messages.map((m) => {
    const key = `${m.at}\u0000${m.sender}\u0000${m.text}`;
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    return { ...m, dup: n };
  });
}

/** Most frequent participant names first; system messages excluded. */
export function participantsOf(messages: { sender: string; kind: string }[]): string[] {
  const counts = new Map<string, number>();
  for (const m of messages) if (m.kind !== "system") counts.set(m.sender, (counts.get(m.sender) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
}

/** Guess which participant is the owner from a list of names they go by. */
export function guessSelf(participants: string[], ownerNames: string[]): string | null {
  const lower = ownerNames.map((n) => n.toLowerCase().trim());
  const tokens = (s: string) => s.toLowerCase().split(/\s+/).filter((t) => t.length >= 3);
  const ownerTokens = new Set(lower.flatMap(tokens));
  return (
    participants.find((p) => lower.includes(p.toLowerCase().trim())) ??
    // whole-word overlap: "Aditya" ↔ "Aditya Pingle", but not "Adi"
    participants.find((p) => {
      const pt = tokens(p);
      return pt.length > 0 && pt.every((t) => ownerTokens.has(t));
    }) ??
    null
  );
}
