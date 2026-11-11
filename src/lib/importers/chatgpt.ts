/**
 * ChatGPT "Export data" -> conversations. Pure, runs in the browser (and tests).
 *
 * conversations.json is an array of conversations. Each one is a TREE (`mapping`): every edit and
 * "regenerate" is a branch. The conversation as it actually ended is the path from `current_node`
 * back to the root, so we walk parents from current_node and reverse.
 */

export type GptMessage = { at: string; sender: "you" | "ChatGPT"; text: string; kind: "text" | "media"; edited: boolean; dup: number };
export type GptConversation = { id: string; title: string; createdAt: string; updatedAt: string; messages: GptMessage[] };

type Node = {
  id?: string;
  parent?: string | null;
  message?: {
    author?: { role?: string };
    create_time?: number | null;
    content?: { content_type?: string; parts?: unknown[]; text?: string };
    metadata?: { is_visually_hidden_from_conversation?: boolean };
  } | null;
};

type RawConversation = {
  id?: string;
  conversation_id?: string;
  title?: string | null;
  create_time?: number | null;
  update_time?: number | null;
  mapping?: Record<string, Node>;
  current_node?: string | null;
};

const MAX_TEXT = 20000;

function iso(sec: number | null | undefined, fallback: string) {
  if (typeof sec !== "number" || !Number.isFinite(sec) || sec <= 0) return fallback;
  return new Date(sec * 1000).toISOString();
}

/** Text of one message; images/files become a short marker, tool output and hidden context are skipped. */
function textOf(msg: NonNullable<Node["message"]>): { text: string; media: boolean } | null {
  const c = msg.content ?? {};
  const type = c.content_type ?? "text";
  if (["execution_output", "tether_browsing_display", "tether_quote", "system_error", "user_editable_context", "model_editable_context", "thoughts", "reasoning_recap"].includes(type)) return null;
  if (type === "code" && typeof c.text === "string") return { text: c.text, media: false };
  const parts = Array.isArray(c.parts) ? c.parts : [];
  let media = false;
  const out: string[] = [];
  for (const p of parts) {
    if (typeof p === "string") out.push(p);
    else if (p && typeof p === "object") {
      const ct = (p as { content_type?: string }).content_type ?? "";
      if (/image|asset/.test(ct)) {
        media = true;
        out.push("[image]");
      } else if (typeof (p as { text?: string }).text === "string") out.push((p as { text: string }).text);
      else media = true;
    }
  }
  const text = out.join("\n").trim();
  if (!text) return null;
  return { text: text.slice(0, MAX_TEXT), media: media && text === "[image]" };
}

export function parseConversation(raw: RawConversation): GptConversation | null {
  const id = raw.id ?? raw.conversation_id;
  const mapping = raw.mapping ?? {};
  if (!id || !Object.keys(mapping).length) return null;
  const createdAt = iso(raw.create_time, new Date(0).toISOString());
  const updatedAt = iso(raw.update_time, createdAt);

  // Walk the path that was actually kept: current_node -> parent -> ... -> root.
  let cursor = raw.current_node ?? null;
  if (!cursor || !mapping[cursor]) {
    // Older exports: fall back to the deepest leaf.
    const leaves = Object.keys(mapping).filter((k) => !Object.values(mapping).some((n) => n.parent === k));
    cursor = leaves.at(-1) ?? null;
  }
  const path: Node[] = [];
  const seen = new Set<string>();
  while (cursor && mapping[cursor] && !seen.has(cursor)) {
    seen.add(cursor);
    path.push(mapping[cursor]);
    cursor = mapping[cursor].parent ?? null;
  }
  path.reverse();

  const messages: GptMessage[] = [];
  const dupCount = new Map<string, number>();
  let last = createdAt;
  for (const node of path) {
    const msg = node.message;
    const role = msg?.author?.role;
    if (!msg || (role !== "user" && role !== "assistant")) continue;
    if (msg.metadata?.is_visually_hidden_from_conversation) continue;
    const body = textOf(msg);
    if (!body) continue;
    const at = iso(msg.create_time, last);
    last = at;
    const sender = role === "user" ? "you" : "ChatGPT";
    const key = `${at}|${sender}|${body.text.slice(0, 200)}`;
    const dup = dupCount.get(key) ?? 0;
    dupCount.set(key, dup + 1);
    messages.push({ at, sender, text: body.text, kind: body.media ? "media" : "text", edited: false, dup });
  }
  if (!messages.some((m) => m.sender === "you")) return null;
  const title = (raw.title ?? "").trim() || messages.find((m) => m.sender === "you")!.text.slice(0, 60);
  return { id, title: title.slice(0, 150), createdAt, updatedAt, messages };
}

export function parseChatGptExport(json: unknown): GptConversation[] {
  const list = Array.isArray(json) ? json : Array.isArray((json as { conversations?: unknown[] })?.conversations) ? (json as { conversations: unknown[] }).conversations : [];
  const out: GptConversation[] = [];
  for (const raw of list) {
    const c = parseConversation(raw as RawConversation);
    if (c) out.push(c);
  }
  return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
