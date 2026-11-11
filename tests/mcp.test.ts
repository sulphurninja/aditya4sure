import { describe, expect, it, vi } from "vitest";
import { TaskCreateInput, TaskPatchInput } from "@/lib/domain";

vi.mock("server-only", () => ({}));

const TOKEN = "t".repeat(40);
process.env.MCP_TOKEN = TOKEN;

const ctx = (key?: string[]) => ({ params: Promise.resolve({ key }) });
const rpc = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://localhost:3000/api/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...headers },
    body: JSON.stringify(body),
  });

describe("task schemas", () => {
  it("fills sensible defaults", () => {
    const t = TaskCreateInput.parse({ title: "send zaptick deck" });
    expect(t).toMatchObject({ kind: "todo", area: "work", priority: 2, source: "app", entityIds: [] });
  });

  it("rejects junk dates and empty titles", () => {
    expect(() => TaskCreateInput.parse({ title: "x" })).toThrow();
    expect(() => TaskCreateInput.parse({ title: "call bank", due: "tomorrow" })).toThrow();
    expect(() => TaskPatchInput.parse({ status: "archived" })).toThrow();
    expect(TaskPatchInput.parse({ status: "done" })).toEqual({ status: "done" });
  });
});

describe("mcp endpoint auth", { timeout: 30_000 }, () => {
  it("refuses requests without the secret", async () => {
    const { POST } = await import("@/app/api/mcp/[[...key]]/route");
    expect((await POST(rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }), ctx())).status).toBe(401);
    expect((await POST(rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }, { Authorization: "Bearer nope" }), ctx())).status).toBe(401);
    expect((await POST(rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }), ctx(["wrong"]))).status).toBe(401);
    expect((await POST(rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }), ctx([TOKEN, "extra"]))).status).toBe(401);
  });

  it("lists the brain tools with a bearer token or the secret path", async () => {
    const { POST } = await import("@/app/api/mcp/[[...key]]/route");
    for (const res of [
      await POST(rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }, { Authorization: `Bearer ${TOKEN}` }), ctx()),
      await POST(rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }), ctx([TOKEN])),
    ]) {
      expect(res.status).toBe(200);
      const body = (await res.json()) as { result: { tools: { name: string; annotations?: { destructiveHint?: boolean } }[] } };
      const names = body.result.tools.map((t) => t.name);
      expect(names).toEqual(expect.arrayContaining(["brain_context", "search_memory", "remember", "add_task", "voice", "forget_memory"]));
      expect(body.result.tools.find((t) => t.name === "forget_memory")?.annotations?.destructiveHint).toBe(true);
    }
  });
});
