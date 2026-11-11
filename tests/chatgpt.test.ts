import { describe, expect, it } from "vitest";
import { parseChatGptExport } from "@/lib/importers/chatgpt";

const node = (id: string, parent: string | null, role: string | null, text: string | null, t?: number, extra: Record<string, unknown> = {}) => ({
  id,
  parent,
  message: role ? { author: { role }, create_time: t ?? null, content: { content_type: "text", parts: text === null ? [] : [text] }, metadata: {}, ...extra } : null,
});

describe("chatgpt export parser", () => {
  it("follows the branch that was kept (current_node), not regenerated ones", () => {
    const conv = {
      id: "c1",
      title: "Zaptick pricing",
      create_time: 1760000000,
      update_time: 1760000500,
      current_node: "a2",
      mapping: {
        root: node("root", null, null, null),
        sys: node("sys", "root", "system", "you are chatgpt"),
        u1: node("u1", "sys", "user", "how should I price zaptick for SMBs?", 1760000100),
        a1: node("a1", "u1", "assistant", "OLD ANSWER (regenerated away)", 1760000150),
        a2: node("a2", "u1", "assistant", "Try three tiers: starter, growth, pro.", 1760000200),
      },
    };
    const [c] = parseChatGptExport([conv]);
    expect(c.title).toBe("Zaptick pricing");
    expect(c.messages.map((m) => [m.sender, m.text])).toEqual([
      ["you", "how should I price zaptick for SMBs?"],
      ["ChatGPT", "Try three tiers: starter, growth, pro."],
    ]);
    expect(c.messages[0].at).toBe(new Date(1760000100 * 1000).toISOString());
  });

  it("skips system/tool/hidden messages and conversations with nothing he wrote", () => {
    const hidden = {
      id: "c2",
      title: "x",
      create_time: 1760000000,
      current_node: "a",
      mapping: {
        r: node("r", null, null, null),
        u: node("u", "r", "user", "context", 1760000001, { metadata: { is_visually_hidden_from_conversation: true } }),
        a: node("a", "u", "assistant", "hi", 1760000002),
      },
    };
    expect(parseChatGptExport([hidden])).toEqual([]);
  });

  it("turns image parts into a marker and keeps text next to them", () => {
    const conv = {
      id: "c3",
      title: "",
      create_time: 1760000000,
      current_node: "u",
      mapping: {
        r: node("r", null, null, null),
        u: { id: "u", parent: "r", message: { author: { role: "user" }, create_time: 1760000010, content: { content_type: "multimodal_text", parts: [{ content_type: "image_asset_pointer" }, "what font is this?"] } } },
      },
    };
    const [c] = parseChatGptExport([conv]);
    expect(c.messages[0].text).toBe("[image]\nwhat font is this?");
    expect(c.title).toBe("[image]\nwhat font is this?".slice(0, 60));
  });
});
